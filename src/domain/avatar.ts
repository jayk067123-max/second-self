import { z } from "zod";
import {
  DEFAULT_CONFLICT_OPTIONS,
  minutesOnDay,
  type ConflictOptions,
} from "./conflicts";
import type { Task } from "./schemas/task";
import { formatDuration, parseIsoToMs, dayKeyOf, expandOccurrences, msFromDayKey, MS_DAY, repeatDeadlineOnDay } from "./time";

/**
 * 数字分身状态机 —— 纯函数。
 * 输入：任务集合 + 某一天；输出：三态 + 进度 + 一句播报。
 * 不依赖 React、不读时钟、不画图；视觉部分只负责"照着这个状态画"。
 */

export const AvatarStateSchema = z.enum(["energized", "tired", "overloaded"]);
export type AvatarState = z.infer<typeof AvatarStateSchema>;

export const AVATAR_STATE_LABEL: Record<AvatarState, string> = {
  energized: "满血",
  tired: "疲惫",
  overloaded: "超载",
};

export interface AvatarSummary {
  dayKey: string;
  state: AvatarState;
  /** 当天有安排的任务（时间块或截止日落在当天） */
  totalCount: number;
  doneCount: number;
  pendingCount: number;
  completionRate: number;
  /** 已占用分钟数 */
  loadMin: number;
  limitMin: number;
  loadRatio: number;
  /** 进度环取值 0–1 */
  progress: number;
  /** 今日播报：一句人话 */
  broadcast: string;
  /** 下一个该做的任务标题（没有则为 null） */
  nextTaskTitle: string | null;
}

/** 归属于某一天的任务：时间块相交当天，或截止时间落在当天 */
export function tasksOnDay(tasks: readonly Task[], dayKey: string, termStartDayKey?: string | null): Task[] {
  const dayStart = msFromDayKey(dayKey, 0);
  const onDay: Task[] = [];
  for (const task of tasks) {
    if (task.repeat) {
      const occurrence = expandOccurrences(task, new Date(dayStart), new Date(dayStart + MS_DAY), termStartDayKey)[0];
      const deadline = repeatDeadlineOnDay(task, dayKey, termStartDayKey);
      if (!occurrence && deadline) onDay.push({ ...task, deadline, done: task.done || (task.completedOn ?? []).includes(dayKey) });
      if (occurrence) onDay.push({ ...task, start: occurrence.start, end: occurrence.end, done: task.done || (task.completedOn ?? []).includes(dayKey) });
      continue;
    }
    if (belongs(task, dayKey, dayStart)) onDay.push(task);
  }
  return onDay.sort((a,b) => (parseIsoToMs(a.start) ?? parseIsoToMs(a.deadline) ?? Infinity) - (parseIsoToMs(b.start) ?? parseIsoToMs(b.deadline) ?? Infinity));
}

function belongs(task: Task, dayKey: string, dayStart: number): boolean {
    const startMs = parseIsoToMs(task.start);
    const endMs = parseIsoToMs(task.end);
    if (startMs !== null && endMs !== null && endMs > startMs) {
      if (startMs < dayStart + MS_DAY && endMs > dayStart) return true;
    }
    const deadlineMs = parseIsoToMs(task.deadline);
    return deadlineMs !== null && dayKeyOf(deadlineMs) === dayKey;
}

export function computeAvatarSummary(
  tasks: readonly Task[],
  dayKey: string,
  options: ConflictOptions = DEFAULT_CONFLICT_OPTIONS,
): AvatarSummary {
  const today = tasksOnDay(tasks, dayKey);
  const doneCount = today.filter((t) => t.done).length;
  const totalCount = today.length;
  const completionRate = totalCount === 0 ? 0 : doneCount / totalCount;

  const loadMin = minutesOnDay(today, dayKey);
  const loadRatio = options.dailyLimitMin === 0 ? 0 : loadMin / options.dailyLimitMin;

  const pending = today
    .filter((t) => !t.done)
    .sort((a, b) => a.priority - b.priority || compareDeadline(a, b));
  const nextTaskTitle = pending[0]?.title ?? null;

  const state = resolveState({ loadRatio, completionRate, pendingCount: pending.length, totalCount });
  const progress = completionRate;

  return {
    dayKey,
    state,
    totalCount,
    doneCount,
    pendingCount: pending.length,
    completionRate,
    loadMin,
    limitMin: options.dailyLimitMin,
    loadRatio,
    progress,
    broadcast: buildBroadcast({ state, loadMin, limitMin: options.dailyLimitMin, pendingCount: pending.length, doneCount, totalCount, nextTaskTitle }),
    nextTaskTitle,
  };
}

function compareDeadline(a: Task, b: Task): number {
  const da = parseIsoToMs(a.deadline) ?? Number.POSITIVE_INFINITY;
  const db = parseIsoToMs(b.deadline) ?? Number.POSITIVE_INFINITY;
  return da - db;
}

function resolveState(input: {
  loadRatio: number;
  completionRate: number;
  pendingCount: number;
  totalCount: number;
}): AvatarState {
  if (input.totalCount === 0) return "energized";
  if (input.loadRatio >= 1) return "overloaded";
  if (input.loadRatio >= 0.7) return "tired";
  if (input.pendingCount >= 3 && input.completionRate < 0.4) return "tired";
  return "energized";
}

function buildBroadcast(input: {
  state: AvatarState;
  loadMin: number;
  limitMin: number;
  pendingCount: number;
  doneCount: number;
  totalCount: number;
  nextTaskTitle: string | null;
}): string {
  if (input.totalCount === 0) {
    return "今天还是空白页。把群通知里的安排粘进来，我替你排。";
  }
  const load = formatDuration(input.loadMin);
  const limit = formatDuration(input.limitMin);
  const next = input.nextTaskTitle ? `「${input.nextTaskTitle}」` : "今天最后一件事";

  switch (input.state) {
    case "overloaded":
      return `今天排了 ${load}，超过上限 ${limit}。别硬扛，先把${next}挪到明天。`;
    case "tired":
      return `已排 ${load} / 上限 ${limit}，还剩 ${input.pendingCount} 项。先啃${next}，其余别急着加。`;
    case "energized":
      return `节奏舒服：${load} 负载，${input.doneCount}/${input.totalCount} 已完成。接下来是${next}。`;
  }
}
