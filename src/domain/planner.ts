import { z } from "zod";
import { DEFAULT_CONFLICT_OPTIONS, dailyTotals, timedTasksOf } from "./conflicts";
import type { Task } from "./schemas/task";
import { MS_MINUTE, formatClock, formatDuration, msFromDayKey, parseIsoToMs } from "./time";

/**
 * 重排方案 —— 纯函数：校验、写回、本地兜底生成。
 *
 * 设计原则（对应赛题「方法创新性与意图控制」）：
 * 模型只负责"提方案 + 给理由"，**合法性由本地代码判定**。
 * 任何不满足 不重叠 / 不超日上限 / 不越作息窗口 / 不缩水 / 不超 deadline 的方案一律丢弃。
 */

export const PlanBlockSchema = z.object({
  taskId: z.string().min(1),
  start: z.string(),
  end: z.string(),
});
export type PlanBlock = z.infer<typeof PlanBlockSchema>;

export const ReplanPlanSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(60),
  rationale: z.string().trim().min(1).max(400),
  blocks: z.array(PlanBlockSchema).min(1).max(40),
});
export type ReplanPlan = z.infer<typeof ReplanPlanSchema>;

/** 模型输出契约：不带 id（由服务端补），最多 3 套 */
export const AiReplanOutputSchema = z.object({
  plans: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(60),
        rationale: z.string().trim().min(1).max(400),
        blocks: z.array(PlanBlockSchema).min(1).max(40),
      }),
    )
    .min(2)
    .max(3),
});
export type AiReplanOutput = z.infer<typeof AiReplanOutputSchema>;

export const PlanOptionsSchema = z.object({
  bufferMin: z.number().int().min(0).max(120),
  dailyLimitMin: z.number().int().min(60).max(24 * 60),
  /** 作息窗口：当天允许安排任务的起止分钟 */
  dayStartMin: z.number().int().min(0).max(24 * 60),
  dayEndMin: z.number().int().min(0).max(24 * 60),
});
export type PlanOptions = z.infer<typeof PlanOptionsSchema>;

export const DEFAULT_PLAN_OPTIONS: PlanOptions = {
  ...DEFAULT_CONFLICT_OPTIONS,
  dayStartMin: 7 * 60,
  dayEndMin: 23 * 60,
};

export interface PlanValidationResult {
  ok: boolean;
  issues: string[];
}

/** 单个时间块的硬约束 */
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
 * 校验一套方案是否可落地。
 * @param tasks 当前全部任务（含方案未覆盖的，用于算当日总量）
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
    const prev = intervals[i - 1]!;
    const cur = intervals[i]!;
    if (cur.s < prev.e) {
      const nameOf = (id: string) => tasks.find((t) => t.id === id)?.title ?? id;
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
