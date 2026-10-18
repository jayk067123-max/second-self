import {
  DEFAULT_CONFLICT_OPTIONS,
  DEFAULT_DETECT_CONFIG,
  dailyTotals,
  detectConflicts,
  timedTasksOf,
  type Conflict,
  type DetectConfig,
} from "./conflicts";
import type { PlanBlock, PlanOptions, Proposal, ReflowConfig, ReflowOp, ReplanPlan } from "./schemas/reflow";
import { AiProposalDraftSchema } from "./schemas/reflow";
import type { Task } from "./schemas/task";
import {
  MS_MINUTE,
  dayKeyOf,
  formatClock,
  formatDuration,
  msFromDayKey,
  parseIsoToMs,
  weekdayLabel,
} from "./time";

export {
  AiProposalDraftSchema,
  AiProposalOutputSchema,
  AiReplanOutputSchema,
  PlanBlockSchema,
  PlanOptionsSchema,
  ProposalSchema,
  ReflowConfigSchema,
  ReflowOpSchema,
  ReplanPlanSchema,
} from "./schemas/reflow";
export type {
  AddOp,
  AiProposalDraft,
  AiProposalOutput,
  AiReplanOutput,
  MoveOp,
  PlanBlock,
  PlanOptions,
  Proposal,
  ReflowConfig,
  ReflowOp,
  RemoveOp,
  ReplanPlan,
  ResizeOp,
} from "./schemas/reflow";

/**
 * 重排方案的**本地合法性裁决器** —— 项目里唯一有权说"这套方案能用"的地方。
 *
 * 架构主张（ARCHITECTURE §0）：模型只负责"提议"，判与存全在本地。
 * 所以这里的输入永远是**不可信的外部数据**（模型输出等同于用户粘贴的脏文本），
 * 每一道闸都在拦一类具体的幻觉：
 *
 *   1. 结构闸：zod 硬校验，字段形状不对直接不进入裁决；
 *   2. 动作闸：逐条 op 检查 —— 不重叠 / 不超日容量 / 不改 locked /
 *      不违背 deadline 前置 / 时长 > 0 / 不越作息窗口；
 *   3. 整体闸：动作全部落地后再做一次全局校验（挡住"每条都合法、合起来越界"）；
 *   4. 效果闸：用本地冲突检测实算前后冲突数，**变差的方案直接不呈现**。
 *
 * 被动作闸拒掉的 op 会丢弃并重试一次；重试后仍不合法，整套方案作废 ——
 * "宁可少给一套方案，也不给一套会毁掉用户一天的方案"。
 */

export const DEFAULT_REFLOW_CONFIG: ReflowConfig = { dayStartMin: 7 * 60, dayEndMin: 23 * 60 };

/** 牺牲项判定线：22:00 之后还在做事、08:00 之前就开工 */
const NIGHT_LINE_MIN = 22 * 60;
const EARLY_LINE_MIN = 8 * 60;

/** 单个动作被拒的原因（调试可见，也会回灌给 AI 层做定向修复） */
export interface OpRejection {
  opIndex: number;
  opType: ReflowOp["type"];
  taskId: string | null;
  reason: string;
}

/** 整套方案被作废的原因 */
export interface ProposalRejection {
  proposalId: string;
  label: string;
  reasons: string[];
}

/** 全局校验的一条违规：必须带 taskIds，才能反查是哪个动作闯的祸 */
interface Violation {
  reason: string;
  taskIds: string[];
}

/** 裁决通过后的方案：卡片 + 落地后的任务集（整体替换用） */
export interface AdjudicatedProposal {
  proposal: Proposal;
  tasksAfter: Task[];
  conflictsBefore: Conflict[];
  conflictsAfter: Conflict[];
  droppedOps: OpRejection[];
}

export type Adjudication =
  | { ok: true; value: AdjudicatedProposal }
  | { ok: false; rejection: ProposalRejection };

export interface JudgeReport {
  accepted: AdjudicatedProposal[];
  rejected: ProposalRejection[];
}

/** 裁决所需的外部输入。`now` 必须注入，与冲突检测保持同一套时间口径 */
export interface JudgeInputs {
  now: Date;
  config?: ReflowConfig;
  detect?: DetectConfig;
}

interface Block {
  startMs: number;
  endMs: number;
}

function blockOf(startMs: number | null, endMs: number | null): Block | null {
  if (startMs === null || endMs === null) return null;
  if (endMs <= startMs) return null;
  return { startMs, endMs };
}

function blockOfTask(task: Task): Block | null {
  return blockOf(parseIsoToMs(task.start), parseIsoToMs(task.end));
}

function titleOf(tasks: readonly Task[], id: string): string {
  return tasks.find((task) => task.id === id)?.title ?? id;
}

// ─────────────────────────────────────────────────────────────
// 动作闸：单条 op 的硬约束
// ─────────────────────────────────────────────────────────────

/**
 * 作息窗口检查。
 * 为什么方案不允许跨天块：一个 22:00–01:00 的块在时间轴上会横跨两列，
 * 差异高亮的"幽灵块+弧线"画法表达不了它，而且它几乎必然是模型算错的产物。
 * 真正的跨天任务（用户自己录的）不经过这里，方案不该新造这种块。
 */
function windowViolation(block: Block, config: ReflowConfig): string | null {
  const dayKey = dayKeyOf(block.startMs);
  const windowStart = msFromDayKey(dayKey, config.dayStartMin);
  const windowEnd = msFromDayKey(dayKey, config.dayEndMin);
  if (block.startMs < windowStart || block.endMs > windowEnd) {
    return `超出作息窗口 ${formatClock(windowStart)}–${formatClock(windowEnd)}`;
  }
  return null;
}

/** 与其余任务的时间重叠检查（半开区间，首尾相接合法） */
function overlapViolation(
  candidateId: string,
  block: Block,
  tasks: readonly Task[],
  titleOfId: (id: string) => string,
): string | null {
  for (const other of tasks) {
    if (other.id === candidateId) continue;
    const otherBlock = blockOfTask(other);
    if (!otherBlock) continue;
    const overlap = block.startMs < otherBlock.endMs && block.endMs > otherBlock.startMs;
    if (overlap) {
      return `与「${titleOfId(other.id)}」时间重叠`;
    }
  }
  return null;
}

/** 当日容量检查：跨天切分后按归属日累计 */
function capacityViolation(tasks: readonly Task[], dayKey: string, capacityMin: number): string | null {
  const used = dailyTotals(timedTasksOf(tasks)).get(dayKey) ?? 0;
  if (used <= capacityMin) return null;
  return `${dayKey} 累计 ${formatDuration(used)}，超过每日上限 ${formatDuration(capacityMin)}`;
}

/** deadline 前置：任务不能排到自己的截止时间之后 */
function deadlineViolation(task: Task, endMs: number): string | null {
  const deadlineMs = parseIsoToMs(task.deadline);
  if (deadlineMs === null) return null;
  if (endMs <= deadlineMs) return null;
  return `排到了截止时间之后`;
}

interface ApplyResult {
  ok: boolean;
  /** ok 时的任务集（新数组，不改入参） */
  tasks: Task[];
  /** ok 时被改动/新增的任务 id */
  taskId: string;
  /** 开始时间是否变了（movedCount 用它） */
  changedStart: boolean;
  /** 变动前的开始时间（deviationMin 用它；新增任务为 null） */
  baselineStartMs: number | null;
  /** 变动后的开始时间 */
  newStartMs: number;
  reason: string;
}

const REJECT = (reason: string, tasks: readonly Task[]): ApplyResult => ({
  ok: false,
  tasks: [...tasks],
  taskId: "",
  changedStart: false,
  baselineStartMs: null,
  newStartMs: 0,
  reason,
});

/**
 * 应用单条 op 并就地过闸。
 * 一旦不过闸立即回滚（返回原任务集），所以"被拒的 op 不产生任何副作用"。
 */
function applyOp(
  tasks: readonly Task[],
  op: ReflowOp,
  opIndex: number,
  config: ReflowConfig,
  detect: DetectConfig,
): ApplyResult {
  switch (op.type) {
    case "move":
    case "resize": {
      const target = tasks.find((task) => task.id === op.taskId);
      if (!target) return REJECT(`方案里出现了不存在的任务 id：${op.taskId}`, tasks);
      if (target.done) return REJECT(`「${target.title}」已完成，不需要重排`, tasks);
      // 固定块（课表/排班）是外部世界给的约束，方案移动它就是自欺欺人
      if (target.locked) return REJECT(`「${target.title}」是固定块，方案不得移动`, tasks);

      const block = blockOf(parseIsoToMs(op.start), parseIsoToMs(op.end));
      if (!block) return REJECT(`「${target.title}」的起止时间不合法（时长必须 > 0）`, tasks);

      const minutes = Math.round((block.endMs - block.startMs) / MS_MINUTE);
      if (op.type === "move") {
        // move 的语义就是不改变时长；时长变了应该用 resize，这里判死是为了
        // 让"这套方案到底动了什么"始终可解释
        if (Math.abs(minutes - target.durationMin) > 1) {
          return REJECT(
            `「${target.title}」时长从 ${formatDuration(target.durationMin)} 变成 ${formatDuration(minutes)}，移动不得改变时长（应使用 resize）`,
            tasks,
          );
        }
      } else if (!target.flexible) {
        // 只有标记为可顺延/可压缩的任务才允许缩水；其余任务的时间是硬承诺
        return REJECT(`「${target.title}」未标记为可压缩，方案不得改变它的时长`, tasks);
      }

      const windowIssue = windowViolation(block, config);
      if (windowIssue) return REJECT(`「${target.title}」${windowIssue}`, tasks);

      const deadlineIssue = deadlineViolation(target, block.endMs);
      if (deadlineIssue) return REJECT(`「${target.title}」${deadlineIssue}`, tasks);

      const overlapIssue = overlapViolation(target.id, block, tasks, (id) => titleOf(tasks, id));
      if (overlapIssue) return REJECT(`「${target.title}」${overlapIssue}`, tasks);

      const next = tasks.map((task) =>
        task.id === target.id
          ? {
              ...task,
              start: new Date(block.startMs).toISOString(),
              end: new Date(block.endMs).toISOString(),
              durationMin: minutes,
            }
          : task,
      );

      const capacityIssue = capacityViolation(next, dayKeyOf(block.startMs), detect.dayCapacityMin);
      if (capacityIssue) return REJECT(`「${target.title}」落地后 ${capacityIssue}`, tasks);

      const baselineStartMs = parseIsoToMs(target.start);
      return {
        ok: true,
        tasks: next,
        taskId: target.id,
        changedStart: baselineStartMs !== block.startMs,
        baselineStartMs,
        newStartMs: block.startMs,
        reason: "",
      };
    }

    case "add": {
      const block = blockOf(parseIsoToMs(op.start), parseIsoToMs(op.end));
      if (!block) return REJECT("新增时间块的起止不合法（时长必须 > 0）", tasks);

      // id 由本地确定性生成：模型给的不算数，否则它会编出与现有任务撞车的 id
      const taskId = op.taskId ?? `added-${opIndex + 1}`;
      if (tasks.some((task) => task.id === taskId)) {
        return REJECT(`新增任务的 id 与现有任务冲突：${taskId}`, tasks);
      }

      const windowIssue = windowViolation(block, config);
      if (windowIssue) return REJECT(`新增时间块${windowIssue}`, tasks);

      const overlapIssue = overlapViolation(taskId, block, tasks, (id) => titleOf(tasks, id));
      if (overlapIssue) return REJECT(`新增时间块${overlapIssue}`, tasks);

      const deadlineMs = parseIsoToMs(op.deadline ?? null);
      if (deadlineMs !== null && block.endMs > deadlineMs) {
        return REJECT("新增时间块排到了它自己的截止时间之后", tasks);
      }

      const created: Task = {
        id: taskId,
        title: op.title,
        start: new Date(block.startMs).toISOString(),
        end: new Date(block.endMs).toISOString(),
        durationMin: Math.round((block.endMs - block.startMs) / MS_MINUTE),
        deadline: op.deadline ?? null,
        priority: op.priority ?? 2,
        source: "manual",
        done: false,
        rawTextOrigin: null,
        location: op.location ?? null,
        locked: false,
        // 补出来的准备时间天然是可调的：它存在的意义就是缓冲
        flexible: true,
        parentId: null,
        repeat: null,
        needsReview: false,
      };

      const next = [...tasks, created];
      const capacityIssue = capacityViolation(next, dayKeyOf(block.startMs), detect.dayCapacityMin);
      if (capacityIssue) return REJECT(`新增时间块落地后 ${capacityIssue}`, tasks);

      return {
        ok: true,
        tasks: next,
        taskId,
        // 新增不是"挪动"，不计入 movedCount（卡片上用「＋ 新增」单独表达）
        changedStart: false,
        baselineStartMs: null,
        newStartMs: block.startMs,
        reason: "",
      };
    }

    case "remove": {
      const target = tasks.find((task) => task.id === op.taskId);
      if (!target) return REJECT(`方案里出现了不存在的任务 id：${op.taskId}`, tasks);
      if (target.locked) return REJECT(`「${target.title}」是固定块，方案不得删除`, tasks);
      if (target.done) return REJECT(`「${target.title}」已完成，删除会丢掉已完成记录`, tasks);
      return {
        ok: true,
        tasks: tasks.filter((task) => task.id !== target.id),
        taskId: target.id,
        changedStart: false,
        // 删除不产生"偏离原计划"的分钟数，只影响条数
        baselineStartMs: null,
        newStartMs: 0,
        reason: "",
      };
    }

    default: {
      const exhaustive: never = op;
      return REJECT(`未知的动作类型：${String(exhaustive)}`, tasks);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 整体闸：所有动作落地后的全局校验
// ─────────────────────────────────────────────────────────────

/**
 * 整体校验。
 * 为什么逐条过了闸还要再全校验一次：逐条只能保证"这一步之后还合法"，
 * 挡不住"A 挪到 14:00、B 挪到 14:30"这种两条单独都合法、合起来重叠的情况
 * （后一条会被逐条闸挡下，但如果模型给的是 remove + add 组合，仍可能漏）。
 */
function validateWhole(after: readonly Task[], baseline: readonly Task[], detect: DetectConfig): Violation[] {
  const violations: Violation[] = [];

  // 1) 固定块未被移动/删除：信任指标 lockedTouched 必须为 0
  for (const before of baseline) {
    if (!before.locked) continue;
    const current = after.find((task) => task.id === before.id);
    if (!current) {
      violations.push({ reason: `固定块「${before.title}」被方案删除`, taskIds: [before.id] });
      continue;
    }
    if (current.start !== before.start || current.end !== before.end) {
      violations.push({ reason: `固定块「${before.title}」被方案移动`, taskIds: [before.id] });
    }
  }

  // 2) 两两不重叠（半开区间）
  const timed = timedTasksOf(after).sort((a, b) => a.startMs - b.startMs);
  for (let i = 1; i < timed.length; i += 1) {
    const previous = timed[i - 1];
    const current = timed[i];
    if (!previous || !current) continue;
    if (current.startMs < previous.endMs) {
      violations.push({
        reason: `落地后「${previous.task.title}」与「${current.task.title}」仍然重叠`,
        taskIds: [previous.task.id, current.task.id],
      });
    }
  }

  // 3) 每日容量
  const totals = dailyTotals(timedTasksOf(after));
  for (const [dayKey, used] of totals) {
    if (used > detect.dayCapacityMin) {
      const ids = after
        .filter((task) => {
          const block = blockOfTask(task);
          return block !== null && dayKeyOf(block.startMs) === dayKey;
        })
        .map((task) => task.id);
      violations.push({
        reason: `${dayKey} 累计 ${formatDuration(used)}，超过每日上限 ${formatDuration(detect.dayCapacityMin)}`,
        taskIds: ids,
      });
    }
  }

  // 4) 时长 > 0 与 deadline 前置
  for (const task of after) {
    const startMs = parseIsoToMs(task.start);
    const endMs = parseIsoToMs(task.end);
    if (startMs === null || endMs === null) continue;
    if (endMs <= startMs) {
      violations.push({ reason: `「${task.title}」的时长为 0 或负`, taskIds: [task.id] });
      continue;
    }
    const deadlineMs = parseIsoToMs(task.deadline);
    if (deadlineMs !== null && endMs > deadlineMs) {
      violations.push({ reason: `「${task.title}」被排到截止时间之后`, taskIds: [task.id] });
    }
  }

  return violations;
}

// ─────────────────────────────────────────────────────────────
// 统计与牺牲项
// ─────────────────────────────────────────────────────────────

interface AppliedOp {
  opIndex: number;
  op: ReflowOp;
  taskId: string;
  changedStart: boolean;
  baselineStartMs: number | null;
  newStartMs: number;
}

interface GateResult {
  tasks: Task[];
  applied: AppliedOp[];
  dropped: OpRejection[];
}

/** 逐条过闸：被拒的 op 丢弃并继续，不产生任何副作用 */
function gateOps(
  baseline: readonly Task[],
  ops: readonly { op: ReflowOp; opIndex: number }[],
  config: ReflowConfig,
  detect: DetectConfig,
): GateResult {
  let current: Task[] = [...baseline];
  const applied: AppliedOp[] = [];
  const dropped: OpRejection[] = [];

  for (const { op, opIndex } of ops) {
    const result = applyOp(current, op, opIndex, config, detect);
    if (!result.ok) {
      dropped.push({
        opIndex,
        opType: op.type,
        taskId: op.type === "add" ? null : op.taskId,
        reason: result.reason,
      });
      continue;
    }
    current = result.tasks;
    applied.push({
      opIndex,
      op,
      taskId: result.taskId,
      changedStart: result.changedStart,
      baselineStartMs: result.baselineStartMs,
      newStartMs: result.newStartMs,
    });
  }

  return { tasks: current, applied, dropped };
}

/** 结束时间晚于某条线的日期集合（"22:00 后仍在做事"） */
function daysEndingAfter(tasks: readonly Task[], lineMin: number): Set<string> {
  const days = new Set<string>();
  for (const { startMs, endMs } of timedTasksOf(tasks)) {
    const dayKey = dayKeyOf(startMs);
    const endMin = Math.round((endMs - msFromDayKey(dayKey, 0)) / MS_MINUTE);
    if (endMin > lineMin) days.add(dayKey);
  }
  return days;
}

/** 开始时间早于某条线的日期集合（"08:00 前就开工"） */
function daysStartingBefore(tasks: readonly Task[], lineMin: number): Set<string> {
  const days = new Set<string>();
  for (const { startMs } of timedTasksOf(tasks)) {
    const dayKey = dayKeyOf(startMs);
    const startMin = Math.round((startMs - msFromDayKey(dayKey, 0)) / MS_MINUTE);
    if (startMin < lineMin) days.add(dayKey);
  }
  return days;
}

/**
 * 牺牲项：这套方案换来"冲突变少"，代价是什么。
 * 只报告**新增**的代价（原计划就有的不算牺牲），并且强制不超过 6 条 ——
 * 卡片上只放得下一行，写多了用户直接不看了。
 */
function computeSacrifices(baseline: readonly Task[], after: readonly Task[], conflictsAfter: number): string[] {
  const items: string[] = [];
  if (conflictsAfter > 0) items.push(`仍有 ${conflictsAfter} 个冲突`);

  const lateAfter = daysEndingAfter(after, NIGHT_LINE_MIN);
  const lateBefore = daysEndingAfter(baseline, NIGHT_LINE_MIN);
  for (const dayKey of [...lateAfter].sort()) {
    if (!lateBefore.has(dayKey)) items.push(`${weekdayLabel(dayKey)} 22:00 后仍有任务`);
  }

  const earlyAfter = daysStartingBefore(after, EARLY_LINE_MIN);
  const earlyBefore = daysStartingBefore(baseline, EARLY_LINE_MIN);
  for (const dayKey of [...earlyAfter].sort()) {
    if (!earlyBefore.has(dayKey)) items.push(`${weekdayLabel(dayKey)} 早八被占用`);
  }

  return items.slice(0, 6);
}

// ─────────────────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────────────────

export interface ProposalCandidate {
  id: string;
  rank: 1 | 2 | 3;
  label: string;
  ops: ReflowOp[];
}

/**
 * 裁决一套方案。返回 ok:false 的方案**不得呈现给用户**。
 *
 * 三次机会（对应 SPEC B1 的"丢弃并重试一次"）：
 *   1. 逐条过闸 → 丢掉不合法的动作；
 *   2. 整体校验 → 仍不合法时，把违规任务对应的动作也丢掉，再重试一次；
 *   3. 效果闸 → 冲突数没有下降（或上升）的方案作废。
 */
export function adjudicateProposal(
  candidate: ProposalCandidate,
  tasks: readonly Task[],
  inputs: JudgeInputs,
): Adjudication {
  if (!Number.isFinite(inputs.now.getTime())) {
    throw new TypeError("adjudicateProposal 需要一个有效的 now（禁止隐式使用当前时间）");
  }
  const config = inputs.config ?? DEFAULT_REFLOW_CONFIG;
  const detect = inputs.detect ?? DEFAULT_DETECT_CONFIG;
  const baseline = [...tasks];

  const conflictsBefore = detectConflicts(baseline, detect, inputs.now);
  const indexed = candidate.ops.map((op, opIndex) => ({ op, opIndex }));

  const gate1 = gateOps(baseline, indexed, config, detect);
  if (gate1.applied.length === 0) {
    return {
      ok: false,
      rejection: {
        proposalId: candidate.id,
        label: candidate.label,
        reasons: ["方案里没有任何一条动作通过本地校验", ...gate1.dropped.map((d) => d.reason)],
      },
    };
  }

  const violations1 = validateWhole(gate1.tasks, baseline, detect);
  let finalGate = gate1;
  const dropped = [...gate1.dropped];

  if (violations1.length > 0) {
    // 重试一次：把违规任务牵连的动作也丢掉，重新逐条过闸
    const offending = new Set(violations1.flatMap((violation) => violation.taskIds));
    const survivors = gate1.applied.filter((applied) => !offending.has(applied.taskId));
    const retry = gateOps(
      baseline,
      survivors.map((applied) => ({ op: applied.op, opIndex: applied.opIndex })),
      config,
      detect,
    );
    for (const applied of gate1.applied) {
      if (offending.has(applied.taskId)) {
        dropped.push({
          opIndex: applied.opIndex,
          opType: applied.op.type,
          taskId: applied.taskId,
          reason: "该动作导致整体校验不通过，重试时被丢弃",
        });
      }
    }
    const violations2 = validateWhole(retry.tasks, baseline, detect);
    if (retry.applied.length === 0 || violations2.length > 0) {
      return {
        ok: false,
        rejection: {
          proposalId: candidate.id,
          label: candidate.label,
          reasons: [...violations1, ...violations2].map((violation) => violation.reason),
        },
      };
    }
    finalGate = retry;
  }

  const conflictsAfter = detectConflicts(finalGate.tasks, detect, inputs.now);

  // 效果闸：冲突数没有下降的方案不上桌（SPEC B3：上升方案直接不展示）
  if (conflictsAfter.length >= conflictsBefore.length) {
    return {
      ok: false,
      rejection: {
        proposalId: candidate.id,
        label: candidate.label,
        reasons: [
          `冲突 ${conflictsBefore.length} → ${conflictsAfter.length}，没有变好`,
        ],
      },
    };
  }

  // 信任指标：固定块被动过就是不可接受的方案（结构上已经挡住，这里是最后一道自检）
  const baselineById = new Map(baseline.map((task) => [task.id, task]));
  const lockedTouched = finalGate.applied.filter(
    (applied) => baselineById.get(applied.taskId)?.locked === true,
  ).length;
  if (lockedTouched > 0) {
    return {
      ok: false,
      rejection: {
        proposalId: candidate.id,
        label: candidate.label,
        reasons: [`触及了 ${lockedTouched} 个固定块，方案作废`],
      },
    };
  }

  const movedCount = finalGate.applied.filter((applied) => applied.changedStart).length;
  const deviationMin = finalGate.applied.reduce((sum, applied) => {
    if (applied.baselineStartMs === null) return sum; // 新增任务没有"原计划"可偏离
    return sum + Math.abs(Math.round((applied.newStartMs - applied.baselineStartMs) / MS_MINUTE));
  }, 0);

  const proposal: Proposal = {
    id: candidate.id,
    rank: candidate.rank,
    label: candidate.label,
    ops: finalGate.applied.map((applied) => applied.op),
    conflictsBefore: conflictsBefore.length,
    conflictsAfter: conflictsAfter.length,
    movedCount,
    deviationMin,
    lockedTouched,
    sacrifices: computeSacrifices(baseline, finalGate.tasks, conflictsAfter.length),
    rejected: dropped.length > 0 ? dropped.map((entry) => ({ reason: entry.reason })) : undefined,
  };

  return {
    ok: true,
    value: {
      proposal,
      tasksAfter: finalGate.tasks,
      conflictsBefore,
      conflictsAfter,
      droppedOps: dropped,
    },
  };
}

/**
 * 批量裁决模型返回的方案 —— AI 层唯一该调用的入口。
 *
 * 输入用 `unknown` 是有意的：模型返回值在类型系统眼里什么都不保证，
 * 先过 zod（第一道闸），再逐个裁决。契约不过的方案进 rejected 而不是抛异常，
 * 这样上层能做"可视修复入口"而不是白屏。
 */
export function judgeProposals(
  rawProposals: readonly unknown[],
  tasks: readonly Task[],
  inputs: JudgeInputs,
): JudgeReport {
  const accepted: AdjudicatedProposal[] = [];
  const rejected: ProposalRejection[] = [];

  rawProposals.forEach((raw, index) => {
    // 契约最多 3 套；多给的按第 3 名处理，绝不因为第 4 套而崩掉整批
    const rank = (Math.min(index + 1, 3) as 1 | 2 | 3);
    const proposalId = `proposal#${index + 1}`;
    const parsed = AiProposalDraftSchema.safeParse(raw);
    if (!parsed.success) {
      rejected.push({
        proposalId,
        label: "（结构不合法的方案）",
        reasons: parsed.error.issues.map((issue) => `字段 ${issue.path.join(".")}：${issue.message}`),
      });
      return;
    }
    const result = adjudicateProposal(
      { id: proposalId, rank, label: parsed.data.label, ops: parsed.data.ops },
      tasks,
      inputs,
    );
    if (result.ok) accepted.push(result.value);
    else rejected.push(result.rejection);
  });

  accepted.sort((a, b) => a.proposal.rank - b.proposal.rank);
  return { accepted, rejected };
}

/** 落地：返回整体替换用的新任务集（不做反向 op，回滚靠快照） */
export function applyProposal(adjudicated: AdjudicatedProposal): Task[] {
  return adjudicated.tasksAfter;
}

/** 方案卡片摘要的一行字（SPEC B3 的 4 个数字 + 牺牲项由 UI 排版） */
export function summarizeProposal(proposal: Proposal): string {
  // 偏离用"分钟"而不是"1 小时"：偏离量是要被横向比较的数字，单位统一才好扫读
  return `挪动 ${proposal.movedCount} 条 · 冲突 ${proposal.conflictsBefore}→${proposal.conflictsAfter} · 偏离 ${proposal.deviationMin} 分钟 · 固定课被挪 ${proposal.lockedTouched} 条`;
}

/* ─────────────────────────────────────────────────────────────
 * 本地兜底方案生成器（原 `src/domain/planner.ts`，按 §2 目录口径并入）
 *
 * 为什么并进 reflow：ARCHITECTURE §2 的目录树里 domain 只有
 * conflicts / reflow / snapshot 三个算法文件，没有 planner。它们本来就是
 * "重排"的两半 —— 有模型时是裁决，没模型时是确定性兜底生成；
 * 分成两个文件名，评委按文档找代码就会找不到。
 *
 * `validatePlan` 保留为兼容导出（AI 兜底层仍在用），但**新代码请用
 * `adjudicateProposal`**：那一套多了 locked 保护、deadline 前置、
 * "冲突数没变好不许上桌"三道它没有的闸。
 * ───────────────────────────────────────────────────────────── */

/**
 * 旧参数形状：bufferMin / dailyLimitMin / 作息窗口。
 * 两个数字直接投影 SPEC 的默认值，作息窗口与 `DEFAULT_REFLOW_CONFIG` 同源，
 * 保证"生成器"和"裁决器"对一天的理解一致，不会一个 7:00–23:00、一个 6:00–24:00。
 */
export const DEFAULT_PLAN_OPTIONS: PlanOptions = {
  ...DEFAULT_CONFLICT_OPTIONS,
  dayStartMin: DEFAULT_REFLOW_CONFIG.dayStartMin,
  dayEndMin: DEFAULT_REFLOW_CONFIG.dayEndMin,
};

export interface PlanValidationResult {
  ok: boolean;
  issues: string[];
}

/** 单个时间块的硬约束（旧校验器用；新代码走 applyOp 的逐条闸） */
function checkBlock(
  block: PlanBlock,
  task: Task | undefined,
  dayKey: string,
  options: PlanOptions,
  issues: string[],
): void {
  if (!task) {
    issues.push(`方案里出现了不存在的任务 id：${block.taskId}`);
    return;
  }
  const startMs = parseIsoToMs(block.start);
  const endMs = parseIsoToMs(block.end);
  if (startMs === null || endMs === null) {
    issues.push(`「${task.title}」的时间格式不合法`);
    return;
  }
  if (endMs <= startMs) {
    issues.push(`「${task.title}」结束时间不晚于开始时间`);
    return;
  }

  const dayStartMs = msFromDayKey(dayKey, options.dayStartMin);
  const dayEndMs = msFromDayKey(dayKey, options.dayEndMin);
  if (startMs < dayStartMs || endMs > dayEndMs) {
    issues.push(
      `「${task.title}」超出作息窗口 ${formatClock(dayStartMs)}–${formatClock(dayEndMs)}`,
    );
  }

  const minutes = Math.round((endMs - startMs) / MS_MINUTE);
  const required = task.durationMin > 0 ? task.durationMin : 15;
  if (minutes < required) {
    issues.push(
      `「${task.title}」被压缩到 ${formatDuration(minutes)}，不少于原定 ${formatDuration(required)}`,
    );
  }

  const deadlineMs = parseIsoToMs(task.deadline);
  if (deadlineMs !== null && endMs > deadlineMs) {
    issues.push(`「${task.title}」被排到截止时间之后`);
  }
}

/**
 * @deprecated 用 `adjudicateProposal` 取代。保留它只是因为 AI 兜底层与
 * `tests/ai/demo.test.ts` 还在引用；等那两处切过去后本函数删除。
 */
export function validatePlan(
  plan: ReplanPlan,
  tasks: readonly Task[],
  dayKey: string,
  options: PlanOptions = DEFAULT_PLAN_OPTIONS,
): PlanValidationResult {
  const issues: string[] = [];
  if (plan.blocks.length === 0) issues.push("方案没有任何时间块");

  const seen = new Set<string>();
  for (const block of plan.blocks) {
    if (seen.has(block.taskId)) {
      issues.push(`同一任务在方案里出现了两次：${block.taskId}`);
    }
    seen.add(block.taskId);
    checkBlock(block, tasks.find((t) => t.id === block.taskId), dayKey, options, issues);
  }

  // 方案内部两两不重叠
  const intervals = plan.blocks
    .map((b) => ({ id: b.taskId, s: parseIsoToMs(b.start), e: parseIsoToMs(b.end) }))
    .filter((x): x is { id: string; s: number; e: number } => x.s !== null && x.e !== null)
    .sort((a, b) => a.s - b.s);

  for (let i = 1; i < intervals.length; i += 1) {
    const prev = intervals[i - 1];
    const cur = intervals[i];
    if (!prev || !cur) continue;
    if (cur.s < prev.e) {
      const nameOf = (id: string): string => tasks.find((t) => t.id === id)?.title ?? id;
      issues.push(`方案内部重叠：「${nameOf(prev.id)}」与「${nameOf(cur.id)}」`);
    }
  }

  // 当日总量：方案块的时长 + 当天未被方案覆盖的任务时长
  const plannedMin = intervals.reduce((sum, x) => sum + Math.round((x.e - x.s) / MS_MINUTE), 0);
  const untouched = tasks.filter((t) => !seen.has(t.id));
  const untouchedDayMin = dailyTotals(timedTasksOf(untouched)).get(dayKey) ?? 0;
  const total = plannedMin + untouchedDayMin;
  if (total > options.dailyLimitMin) {
    issues.push(
      `方案落地后当日累计 ${formatDuration(total)}，超过上限 ${formatDuration(options.dailyLimitMin)}`,
    );
  }

  return { ok: issues.length === 0, issues };
}

/** 写回：把方案里的时间块应用到任务上，返回新数组（不改原数组） */
export function applyPlan(tasks: readonly Task[], plan: ReplanPlan): Task[] {
  const byTaskId = new Map(plan.blocks.map((b) => [b.taskId, b]));
  return tasks.map((task) => {
    const block = byTaskId.get(task.id);
    if (!block) return task;
    const startMs = parseIsoToMs(block.start);
    const endMs = parseIsoToMs(block.end);
    if (startMs === null || endMs === null || endMs <= startMs) return task;
    return {
      ...task,
      start: block.start,
      end: block.end,
      durationMin: Math.round((endMs - startMs) / MS_MINUTE),
    };
  });
}

/**
 * 本地兜底方案生成器（demo 模式 / 无密钥 / 模型方案全被丢弃时使用）。
 * 确定性算法：排序策略不同 → 产出的方案不同，但全部通过 validatePlan。
 */
export function buildLocalPlans(
  tasks: readonly Task[],
  dayKey: string,
  options: PlanOptions = DEFAULT_PLAN_OPTIONS,
): ReplanPlan[] {
  const candidates = tasks.filter((t) => !t.done && t.durationMin > 0);
  if (candidates.length === 0) return [];

  const deadlineOf = (t: Task): number => parseIsoToMs(t.deadline) ?? Number.POSITIVE_INFINITY;

  const policies = [
    {
      id: "local-priority",
      title: "方案一 · 优先级优先",
      rationale:
        "先做紧急任务，把当日最硬的骨头放在状态最好的前置时段；缓冲 15 分钟，不插午休。",
      order: (a: Task, b: Task) => a.priority - b.priority || deadlineOf(a) - deadlineOf(b),
      extraGapMin: 0,
    },
    {
      id: "local-deadline",
      title: "方案二 · 截止日优先",
      rationale:
        "按 DDL 顺序推进，先清掉最容易逾期的事；每两块之间多留 10 分钟回血。",
      order: (a: Task, b: Task) => deadlineOf(a) - deadlineOf(b) || a.priority - b.priority,
      extraGapMin: 10,
    },
  ];

  const plans: ReplanPlan[] = [];
  for (const policy of policies) {
    const ordered = [...candidates].sort(policy.order);
    const blocks: PlanBlock[] = [];
    let cursor = msFromDayKey(dayKey, options.dayStartMin);
    const dayEndMs = msFromDayKey(dayKey, options.dayEndMin);

    for (const task of ordered) {
      const durationMs = task.durationMin * MS_MINUTE;
      if (cursor + durationMs > dayEndMs) break;
      blocks.push({
        taskId: task.id,
        start: new Date(cursor).toISOString(),
        end: new Date(cursor + durationMs).toISOString(),
      });
      cursor += durationMs + (options.bufferMin + policy.extraGapMin) * MS_MINUTE;
    }

    if (blocks.length === 0) continue;
    const plan: ReplanPlan = {
      id: policy.id,
      title: policy.title,
      rationale: `${policy.rationale}（本地确定性算法生成，未调用模型）`,
      blocks,
    };
    if (validatePlan(plan, tasks, dayKey, options).ok) plans.push(plan);
  }
  return plans;
}

/** 方案摘要：覆盖几项、共多少分钟、最晚到几点（UI 卡片顶部展示） */
export function summarizePlan(plan: ReplanPlan): {
  count: number;
  totalMin: number;
  lastEnd: string;
} {
  const intervals = plan.blocks
    .map((b) => ({ s: parseIsoToMs(b.start), e: parseIsoToMs(b.end) }))
    .filter((x): x is { s: number; e: number } => x.s !== null && x.e !== null);
  const totalMin = intervals.reduce((sum, x) => sum + Math.round((x.e - x.s) / MS_MINUTE), 0);
  const lastEndMs = intervals.reduce((max, x) => Math.max(max, x.e), 0);
  return {
    count: plan.blocks.length,
    totalMin,
    lastEnd: lastEndMs === 0 ? "—" : formatClock(lastEndMs),
  };
}
