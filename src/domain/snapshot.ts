import {
  SNAPSHOT_STACK_LIMIT,
  type Snapshot,
  type SnapshotSource,
  type SnapshotStack,
} from "./schemas/snapshot";
import type { Task } from "./schemas/task";
import { dayKeyOf, formatClock, parseIsoToMs } from "./time";

export {
  SNAPSHOT_SOURCE_PATTERN,
  SNAPSHOT_STACK_LIMIT,
  SnapshotSchema,
  SnapshotSourceSchema,
  SnapshotStackSchema,
} from "./schemas/snapshot";
export type { Snapshot, SnapshotSource, SnapshotStack } from "./schemas/snapshot";

/**
 * 快照栈与整体替换式回滚 —— 纯函数，无 IO、无时钟（at 由调用方注入）。
 *
 * 三条设计决定，都写在注释里方便答辩：
 *
 * 1. **快照保存整份 tasksState，回滚 = 整体替换**。
 *    不做反向 op：反向 op 是最容易出错的一类代码，新增/缩水/跨天切分的
 *    逆操作一旦写错，用户回滚后的数据就是坏的，而且很难被测出来。
 * 2. **回滚动作本身也入栈**（source: 'rollback'），所以"重做回滚"是天然支持的：
 *    历史里每一条都能跳过去，跳过去这件事本身又成为一条新的历史。
 * 3. **快照里存的是副本**（逐条浅拷贝）。store 是可变引用，如果快照直接持有
 *    原数组，用户下一次编辑就会把历史一起改掉 —— 这是最难查的一类 bug。
 *
 * 上限 20 条，超出丢最旧；被丢掉的那条若还是别人的 parent，
 * 把引用置 null 而不是留一个悬空的 id。
 */

/** 与快照栈同步过的状态为基准，判断用户在上次快照之后有没有手改 */
export function emptySnapshotStack(): SnapshotStack {
  return { entries: [], currentId: null, seq: 0, syncedState: null };
}

export interface SnapshotInput {
  /** 要存进快照的任务状态（一般是"应用方案之前"的那一份） */
  tasks: readonly Task[];
  at: Date;
  source: SnapshotSource;
  opSummary: string;
}

/** 逐条浅拷贝：Task 的字段全是基本类型，浅拷贝就足够隔离 */
function cloneTasks(tasks: readonly Task[]): Task[] {
  return tasks.map((task) => ({ ...task }));
}

function assertValidDate(at: Date, where: string): void {
  if (!Number.isFinite(at.getTime())) {
    throw new TypeError(`${where} 需要一个有效的 at（禁止隐式使用当前时间）`);
  }
}

/** 摘要过长时截断：卡片和历史面板都只放得下一行 */
function clipSummary(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "未命名变更";
  return trimmed.length <= 60 ? trimmed : trimmed.slice(0, 60);
}

/**
 * 入栈一条快照（"应用方案之前"的那一次快照）。
 * 纯函数：不修改传入的 stack，返回新的栈。
 */
export function pushSnapshot(stack: SnapshotStack, input: SnapshotInput): SnapshotStack {
  assertValidDate(input.at, "pushSnapshot");
  const seq = stack.seq + 1;
  const snapshot: Snapshot = {
    // 不用 uuid / Math.random：domain 内不允许随机源，序号才是可复现的
    snapshotId: `snap-${String(seq).padStart(3, "0")}`,
    parentSnapshotId: stack.currentId,
    at: input.at.toISOString(),
    source: input.source,
    opSummary: clipSummary(input.opSummary),
    tasksState: cloneTasks(input.tasks),
  };

  let entries = [...stack.entries, snapshot];
  if (entries.length > SNAPSHOT_STACK_LIMIT) {
    entries = entries.slice(entries.length - SNAPSHOT_STACK_LIMIT);
  }

  // 被丢掉的旧快照若仍是某条的 parent，置 null，避免历史里出现悬空引用
  const alive = new Set(entries.map((entry) => entry.snapshotId));
  entries = entries.map((entry) =>
    entry.parentSnapshotId !== null && !alive.has(entry.parentSnapshotId)
      ? { ...entry, parentSnapshotId: null }
      : entry,
  );

  return { ...stack, entries, currentId: snapshot.snapshotId, seq };
}

/**
 * 应用方案的原子步骤：先把当前状态快照入栈，再把新状态写回。
 * 顺序不可颠倒 —— 先写回再快照，就等于把"改坏的那一版"当成了可回退的版本。
 */
export function commitWithSnapshot(
  stack: SnapshotStack,
  current: readonly Task[],
  next: readonly Task[],
  input: { at: Date; source: SnapshotSource; opSummary: string },
): { stack: SnapshotStack; tasksState: Task[] } {
  const pushed = pushSnapshot(stack, {
    tasks: current,
    at: input.at,
    source: input.source,
    opSummary: input.opSummary,
  });
  return { stack: { ...pushed, syncedState: cloneTasks(next) }, tasksState: cloneTasks(next) };
}

export interface RollbackResult {
  stack: SnapshotStack;
  /** 回滚后的任务状态（整体替换，直接塞回 store） */
  tasksState: Task[];
  /** 这次回滚本身入栈生成的那条快照 */
  snapshot: Snapshot;
}

/**
 * 回滚到指定版本：**整体替换**任务状态，并让这次回滚本身也入栈。
 * 目标不存在（可能已被 20 条上限淘汰）时返回 null —— 由 UI 提示"该版本已不在历史里"，
 * 而不是抛异常让界面白屏。
 */
export function rollbackTo(
  stack: SnapshotStack,
  snapshotId: string,
  input: { at: Date },
): RollbackResult | null {
  assertValidDate(input.at, "rollbackTo");
  const target = stack.entries.find((entry) => entry.snapshotId === snapshotId);
  if (!target) return null;

  const pushed = pushSnapshot(stack, {
    tasks: target.tasksState,
    at: input.at,
    source: "rollback",
    opSummary: `回滚到 ${target.snapshotId}`,
  });
  const snapshot = pushed.entries[pushed.entries.length - 1];
  if (!snapshot) return null;

  const tasksState = cloneTasks(target.tasksState);
  return {
    stack: { ...pushed, syncedState: cloneTasks(tasksState) },
    tasksState,
    snapshot,
  };
}

/** 最新一条快照（栈顶） */
export function latestSnapshot(stack: SnapshotStack): Snapshot | null {
  return stack.entries[stack.entries.length - 1] ?? null;
}

/** 历史面板数据：倒序（最新在前） */
export function snapshotHistory(stack: SnapshotStack): Snapshot[] {
  return [...stack.entries].reverse();
}

/** 是否还有可回退的版本 */
export function canRollback(stack: SnapshotStack): boolean {
  return stack.entries.length > 0;
}

// ─────────────────────────────────────────────────────────────
// 状态比对（用于"回滚前二次确认"）
// ─────────────────────────────────────────────────────────────

/**
 * 字段固定顺序的规范化序列化。
 * 为什么不用 JSON.stringify(task) 直接比：任务可能来自 localStorage、
 * AI 解析、工厂函数三个来源，对象字面量的 key 顺序不同但语义相同；
 * 直接字符串比较会把"没改"误判成"改过"，然后弹一个假确认框。
 */
const TASK_KEY_ORDER: readonly (keyof Task)[] = [
  "id",
  "title",
  "start",
  "end",
  "durationMin",
  "deadline",
  "priority",
  "source",
  "done",
  "rawTextOrigin",
  "location",
  "locked",
  "flexible",
  "parentId",
  "progress",
  "estateMin",
];

function canonicalTask(task: Task): string {
  // 缺省值与显式 null 归一：两者语义都是"没有这个信息"
  return JSON.stringify(TASK_KEY_ORDER.map((key) => task[key] ?? null));
}

/** 两份任务集是否逐条相同（顺序无关，按 id 排序后比较） */
export function tasksEqual(left: readonly Task[], right: readonly Task[]): boolean {
  if (left.length !== right.length) return false;
  const rightById = new Map(right.map((task) => [task.id, canonicalTask(task)]));
  for (const task of left) {
    const other = rightById.get(task.id);
    if (other === undefined || other !== canonicalTask(task)) return false;
  }
  return true;
}

/**
 * 用户在最后一次快照之后手改了**几处**。
 * 这个数字直接进确认文案：「将丢弃你刚才的 1 处手动修改，继续？」
 */
export function countPendingEdits(stack: SnapshotStack, tasks: readonly Task[]): number {
  const base = stack.syncedState;
  if (base === null) return 0; // 没有基准可比 = 没有"会被丢弃的修改"
  const baseById = new Map(base.map((task) => [task.id, canonicalTask(task)]));
  const currentById = new Map(tasks.map((task) => [task.id, canonicalTask(task)]));

  const ids = new Set([...baseById.keys(), ...currentById.keys()]);
  let changed = 0;
  for (const id of ids) {
    if (baseById.get(id) !== currentById.get(id)) changed += 1;
  }
  return changed;
}

/** 回滚前是否需要二次确认（有未快照的手动修改就必须确认） */
export function needsRollbackConfirm(stack: SnapshotStack, tasks: readonly Task[]): boolean {
  return countPendingEdits(stack, tasks) > 0;
}

/** 历史面板一行：`10-19 09:00 · proposal#1 · 应用「最小改动」：挪 3 条` */
export function snapshotSummary(snapshot: Snapshot): string {
  const atMs = parseIsoToMs(snapshot.at);
  const stamp = atMs === null ? snapshot.at : `${dayKeyOf(atMs).slice(5)} ${formatClock(atMs)}`;
  return `${stamp} · ${snapshot.source} · ${snapshot.opSummary}`;
}
