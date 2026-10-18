import { z } from "zod";
import type { Task } from "./schemas/task";
import {
  MS_MINUTE,
  dayKeyOf,
  formatClockRange,
  formatDuration,
  minutesFromLocalMidnight,
  parseIsoToMs,
  startOfLocalDay,
} from "./time";

/**
 * 冲突检测 —— 纯函数，不依赖 React / IO / 时钟（当前时间由调用方注入）。
 * 三类冲突：时间重叠 / 缓冲不足 / 单日超载。
 */

export const ConflictOptionsSchema = z.object({
  /** 两条任务之间至少留多少分钟缓冲（通勤、切换成本） */
  bufferMin: z.number().int().min(0).max(120),
  /** 单日可用时间上限 */
  dailyLimitMin: z.number().int().min(60).max(24 * 60),
});
export type ConflictOptions = z.infer<typeof ConflictOptionsSchema>;

export const DEFAULT_CONFLICT_OPTIONS: ConflictOptions = {
  bufferMin: 15,
  dailyLimitMin: 10 * 60,
};

export type Conflict =
  | {
      kind: "overlap";
      taskIds: [string, string];
      /** 重叠了多少分钟 */
      minutes: number;
    }
  | {
      kind: "buffer";
      taskIds: [string, string];
      /** 实际间隔（分钟，>=0） */
      gapMin: number;
      requiredMin: number;
    }
  | {
      kind: "daily-overload";
      dayKey: string;
      totalMin: number;
      limitMin: number;
    };

export interface TimedTask {
  task: Task;
  startMs: number;
  endMs: number;
}

/** 抽出所有「带时间块」的任务：开始/结束必须合法，且结束严格晚于开始（零时长不占时段） */
export function timedTasksOf(tasks: readonly Task[]): TimedTask[] {
  const result: TimedTask[] = [];
  for (const task of tasks) {
    const startMs = parseIsoToMs(task.start);
    const endMs = parseIsoToMs(task.end);
    if (startMs === null || endMs === null) continue;
    if (endMs <= startMs) continue;
    result.push({ task, startMs, endMs });
  }
  return result;
}

/**
 * 主入口。返回顺序稳定（先 overlap，再 buffer，最后按天的 overload），便于快照测试。
 */
export function detectConflicts(
  tasks: readonly Task[],
  options: ConflictOptions = DEFAULT_CONFLICT_OPTIONS,
): Conflict[] {
  const timed = timedTasksOf(tasks).sort((a, b) => a.startMs - b.startMs);
  const overlaps: Conflict[] = [];
  const buffers: Conflict[] = [];

  // 任务量级是个位数到几十条，O(n²) 足够且比"只比相邻"更不容易漏
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const a = timed[i]!;
      const b = timed[j]!;
      const overlapMs = Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs);
      if (overlapMs > 0) {
        overlaps.push({
          kind: "overlap",
          taskIds: [a.task.id, b.task.id],
          minutes: Math.round(overlapMs / MS_MINUTE),
        });
        continue;
      }
      // 首尾相接（gap = 0）不算重叠，但算缓冲不足
      const gapMin = Math.round((b.startMs - a.endMs) / MS_MINUTE);
      if (gapMin >= 0 && gapMin < options.bufferMin) {
        buffers.push({
          kind: "buffer",
          taskIds: [a.task.id, b.task.id],
          gapMin,
          requiredMin: options.bufferMin,
        });
      }
    }
  }

  const overloads: Conflict[] = [];
  for (const [dayKey, totalMin] of dailyTotals(timed)) {
    if (totalMin > options.dailyLimitMin) {
      overloads.push({
        kind: "daily-overload",
        dayKey,
        totalMin,
        limitMin: options.dailyLimitMin,
      });
    }
  }
  overloads.sort((a, b) =>
    a.kind === "daily-overload" && b.kind === "daily-overload"
      ? a.dayKey.localeCompare(b.dayKey)
      : 0,
  );

  return [...overlaps, ...buffers, ...overloads];
}

/** 按天累计已占用分钟数；跨天任务在零点切开，分别计入两天 */
export function dailyTotals(timed: readonly TimedTask[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const { startMs, endMs } of timed) {
    let cursor = startMs;
    // 单条任务最长 24h，循环上限足够
    for (let guard = 0; guard < 3 && cursor < endMs; guard += 1) {
      const dayStart = startOfLocalDay(cursor);
      const dayEnd = dayStart + 24 * 60 * MS_MINUTE;
      const segmentEnd = Math.min(endMs, dayEnd);
      const minutes = Math.round((segmentEnd - cursor) / MS_MINUTE);
      if (minutes > 0) {
        const key = dayKeyOf(cursor);
        totals.set(key, (totals.get(key) ?? 0) + minutes);
      }
      cursor = segmentEnd;
    }
  }
  return totals;
}

/** 某一天的已占用分钟数 */
export function minutesOnDay(tasks: readonly Task[], dayKey: string): number {
  return dailyTotals(timedTasksOf(tasks)).get(dayKey) ?? 0;
}

/** 冲突 → 人话（UI 直接用，避免每个组件各写一套措辞） */
export function describeConflict(conflict: Conflict, tasks: readonly Task[]): string {
  const titleOf = (id: string): string => {
    const task = tasks.find((t) => t.id === id);
    return task ? task.title : "已删除的任务";
  };

  switch (conflict.kind) {
    case "overlap": {
      const [a, b] = conflict.taskIds;
      return `「${titleOf(a)}」与「${titleOf(b)}」时间重叠 ${formatDuration(conflict.minutes)}`;
    }
    case "buffer": {
      const [a, b] = conflict.taskIds;
      return `「${titleOf(a)}」与「${titleOf(b)}」之间只有 ${conflict.gapMin} 分钟，建议至少留 ${conflict.requiredMin} 分钟`;
    }
    case "daily-overload":
      return `${conflict.dayKey} 累计 ${formatDuration(conflict.totalMin)}，超过每日上限 ${formatDuration(conflict.limitMin)}`;
  }
}

/** 冲突涉及的任务 id 集合（UI 打红点用） */
export function conflictedTaskIds(conflicts: readonly Conflict[]): Set<string> {
  const ids = new Set<string>();
  for (const conflict of conflicts) {
    if (conflict.kind === "overlap" || conflict.kind === "buffer") {
      ids.add(conflict.taskIds[0]);
      ids.add(conflict.taskIds[1]);
    }
  }
  return ids;
}

/** 调试用：把任务时间块打印成一行，单测里断言更直观 */
export function describeTimedTask(task: Task): string {
  const startMs = parseIsoToMs(task.start);
  const endMs = parseIsoToMs(task.end);
  if (startMs === null || endMs === null) return `${task.title}（无时间块）`;
  return `${task.title} ${formatClockRange(startMs, endMs)} @${minutesFromLocalMidnight(startMs)}min`;
}
