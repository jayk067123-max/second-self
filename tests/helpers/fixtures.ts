import type { Task } from "@/domain/schemas/task";
import { msFromDayKey } from "@/domain/time";

/** 测试夹具：日期固定，避免依赖当前时间 */

export const DAY = "2026-10-18";
export const NEXT_DAY = "2026-10-19";

/** 把「某天第几分钟」转成 ISO 字符串（本地时区） */
export function isoAt(dayKey: string, minutes: number): string {
  return new Date(msFromDayKey(dayKey, minutes)).toISOString();
}

export function hhmm(dayKey: string, hour: number, minute = 0): string {
  return isoAt(dayKey, hour * 60 + minute);
}

let seq = 0;

export function makeTask(patch: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: patch.id ?? `t${seq}`,
    title: patch.title ?? `任务${seq}`,
    start: patch.start ?? null,
    end: patch.end ?? null,
    durationMin: patch.durationMin ?? 0,
    deadline: patch.deadline ?? null,
    priority: patch.priority ?? 2,
    source: patch.source ?? "manual",
    done: patch.done ?? false,
    rawTextOrigin: patch.rawTextOrigin ?? null,
    // schema 里这三个字段带默认值，类型上是必有的；夹具按"最普通的一条任务"补齐
    locked: patch.locked ?? false,
    repeat: patch.repeat ?? null,
    needsReview: patch.needsReview ?? false,
  };
}

/** 便捷构造：当天 h1:m1 – h2:m2 的一个时间块任务 */
export function blockTask(
  dayKey: string,
  h1: number,
  m1: number,
  h2: number,
  m2: number,
  patch: Partial<Task> = {},
): Task {
  const start = hhmm(dayKey, h1, m1);
  const end = hhmm(dayKey, h2, m2);
  return makeTask({
    ...patch,
    start,
    end,
    durationMin: patch.durationMin ?? (h2 * 60 + m2) - (h1 * 60 + m1),
  });
}
