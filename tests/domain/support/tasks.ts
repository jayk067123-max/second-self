import { MS_MINUTE, msFromDayKey } from "@/domain/time";
import type { RepeatRule, Task } from "@/domain/schemas/task";

/**
 * 冲突 / 重排 / 快照三组单测共用的任务夹具。
 *
 * 为什么单独抽出来而不是用 tests/helpers/fixtures.ts：
 * 那份夹具只覆盖基础字段（它服务于 avatar 的旧用例），而冲突规则要靠
 * location / locked / flexible / parentId / progress / estateMin / repeat
 * 才能验证误报红线。这里做成"什么都能传"的工厂，避免每次手写十几个字段。
 *
 * 所有时间都用「本地日的第几分钟」表达再转 ISO —— 单测不依赖机器时区。
 */

/** 演示锚定日（SPEC C 节：DEMO_NOW = 2026-10-19T09:00+08:00，周一） */
export const DAY = "2026-10-18";
export const NEXT_DAY = "2026-10-19";
export const DEMO_NOW = new Date("2026-10-19T09:00:00+08:00");

export function isoAt(dayKey: string, minutes: number): string {
  return new Date(msFromDayKey(dayKey, minutes)).toISOString();
}

export function hhmm(dayKey: string, hour: number, minute = 0): string {
  return isoAt(dayKey, hour * 60 + minute);
}

export interface TaskSpec {
  id?: string;
  title?: string;
  location?: string | null;
  locked?: boolean;
  flexible?: boolean;
  parentId?: string | null;
  progress?: number;
  estateMin?: number;
  done?: boolean;
  priority?: 1 | 2 | 3;
  deadline?: string | null;
  repeat?: RepeatRule | null;
  needsReview?: boolean;
}

let seq = 0;

function nextId(): string {
  seq += 1;
  return `tt-${String(seq).padStart(3, "0")}`;
}

function taskOf(start: string, end: string, spec: TaskSpec): Task {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const durationMin = Math.round((endMs - startMs) / MS_MINUTE);
  return {
    id: spec.id ?? nextId(),
    title: spec.title ?? "任务",
    start,
    end,
    durationMin,
    deadline: spec.deadline ?? null,
    priority: spec.priority ?? 2,
    source: "manual",
    done: spec.done ?? false,
    rawTextOrigin: null,
    location: spec.location ?? null,
    locked: spec.locked ?? false,
    flexible: spec.flexible ?? false,
    parentId: spec.parentId ?? null,
    progress: spec.progress,
    estateMin: spec.estateMin,
    repeat: spec.repeat ?? null,
    needsReview: spec.needsReview ?? false,
  };
}

/** 同一天内的一个时间块 `HH:mm–HH:mm` */
export function block(
  dayKey: string,
  h1: number,
  m1: number,
  h2: number,
  m2: number,
  spec: TaskSpec = {},
): Task {
  return taskOf(hhmm(dayKey, h1, m1), hhmm(dayKey, h2, m2), spec);
}

/** 跨天时间块，例：overnight(DAY, 22, 0, NEXT_DAY, 1, 0) */
export function overnight(
  startDay: string,
  h1: number,
  m1: number,
  endDay: string,
  h2: number,
  m2: number,
  spec: TaskSpec = {},
): Task {
  return taskOf(hhmm(startDay, h1, m1), hhmm(endDay, h2, m2), spec);
}

/** 占时段但时长为 0 的任务（`HH:mm` 起止相同） */
export function point(dayKey: string, h: number, m: number, spec: TaskSpec = {}): Task {
  const at = hhmm(dayKey, h, m);
  return taskOf(at, at, spec);
}

/** 纯 DDL / 备忘任务：没有时间块，只有截止时间 */
export function ddl(deadline: string, spec: TaskSpec = {}): Task {
  return {
    id: spec.id ?? nextId(),
    title: spec.title ?? "待办",
    start: null,
    end: null,
    durationMin: spec.estateMin ?? 30,
    deadline,
    priority: spec.priority ?? 2,
    source: "manual",
    done: spec.done ?? false,
    rawTextOrigin: null,
    location: spec.location ?? null,
    locked: spec.locked ?? false,
    flexible: spec.flexible ?? false,
    parentId: spec.parentId ?? null,
    progress: spec.progress,
    estateMin: spec.estateMin,
    repeat: spec.repeat ?? null,
    needsReview: spec.needsReview ?? false,
  };
}

/**
 * 只有时长的任务：没有时间块、没有截止。
 * 代表"还没被排进时间轴的一句话任务"——重排生成器正是拿这些去填空白。
 */
export function todo(durationMin: number, spec: TaskSpec = {}): Task {
  return {
    id: spec.id ?? nextId(),
    title: spec.title ?? "任务",
    start: null,
    end: null,
    durationMin,
    deadline: spec.deadline ?? null,
    priority: spec.priority ?? 2,
    source: "manual",
    done: spec.done ?? false,
    rawTextOrigin: null,
    location: spec.location ?? null,
    locked: spec.locked ?? false,
    flexible: spec.flexible ?? false,
    parentId: spec.parentId ?? null,
    progress: spec.progress,
    estateMin: spec.estateMin,
    repeat: spec.repeat ?? null,
    needsReview: spec.needsReview ?? false,
  };
}
