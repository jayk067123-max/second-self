/**
 * 时间工具 —— 全部为纯函数，按**本地时区**计算（个人日程必须贴合用户所在时区）。
 * 不使用 Intl 以外的时间库，避免第三方依赖。
 */

import type { Task } from "./schemas/task";
import { dayInWeekSpec, termWeekOf } from "./schedule";

export const MS_MINUTE = 60_000;
export const MS_DAY = 24 * 60 * MS_MINUTE;

export function parseIsoToMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** YYYY-MM-DD（本地时区），用于按天分组 */
export function dayKeyOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * 某一天的 dayKey。
 * `now` 必须由调用方显式传入 —— 这里曾经有个 `= Date.now()` 的默认值，
 * 那等于在 domain 内部偷偷读了系统时钟（ARCHITECTURE §2 铁律3 明令禁止），
 * 后果是录视频那天同一份数据算出来的结果和排练时不一样。默认值已删除。
 */
export function todayKey(now: number): string {
  return dayKeyOf(now);
}

/** 距本地零点的分钟数 */
export function minutesFromLocalMidnight(ms: number): number {
  return Math.round((ms - startOfLocalDay(ms)) / MS_MINUTE);
}

/** 由 dayKey + 当天分钟数还原时间戳 */
export function msFromDayKey(dayKey: string, minutes: number): number {
  const [y, m, d] = dayKey.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  return date.getTime() + minutes * MS_MINUTE;
}

export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatClockRange(startMs: number, endMs: number): string {
  return `${formatClock(startMs)}–${formatClock(endMs)}`;
}

export function formatDuration(minutes: number): string {
  const min = Math.max(0, Math.round(minutes));
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `${h} 小时` : `${h} 小时 ${rest} 分`;
}

export function addDaysToKey(dayKey: string, days: number): string {
  return dayKeyOf(msFromDayKey(dayKey, 0) + days * MS_DAY);
}

export function weekdayLabel(dayKey: string): string {
  const ms = msFromDayKey(dayKey, 0);
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][new Date(ms).getDay()] ?? "";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/* ─────────────────────────────────────────────────────────────
 * 重复任务的展开
 * ───────────────────────────────────────────────────────────── */

/** 重复任务在某个窗口内展开出的一个具体时段（start/end 与 Task 同格式：ISO 字符串） */
export interface TaskOccurrence {
  taskId: string;
  start: string;
  end: string;
}

/** ISO 星期：1=周一 … 7=周日。`Date.getDay()` 是 0=周日，换算只在这里做一次 */
export function isoWeekdayOf(ms: number): number {
  const day = new Date(ms).getDay();
  return day === 0 ? 7 : day;
}

/** 窗口最多向前看多少天（防御性上限：调用方给错窗口也不至于跑飞） */
const MAX_EXPAND_DAYS = 400;

/**
 * 把任务在 `[rangeStart, rangeEnd)` 窗口内展开成具体时段 —— **纯函数**。
 *
 * 为什么窗口必须由调用方传入：这个项目里"现在"永远是注入的
 * （`DEMO_NOW = 2026-10-19T09:00+08:00`），函数内部一旦读系统时间，
 * 录视频那天同一份数据算出来的冲突就会和排练时不一样。
 *
 * 两种任务的处理刻意不同：
 * - **单次任务**（`repeat === null`）：原样返回它自己的时间块，**不按窗口过滤**。
 *   冲突检测拿到的是"全部任务"，如果在这里按窗口剪掉，就会把窗口外的历史任务
 *   静默丢掉，用户会以为冲突消失了。
 * - **重复任务**：只返回窗口内的发生时段，算完即丢，数据里始终只有一行。
 *
 * 周次过滤（`repeat.weeks`）只加一道 if，不动循环结构：
 *   1. 先用 `isoWeekdayOf` 筛星期（周二课只在周二出现）；
 *   2. 再用 `dayInWeekSpec` 筛学期周次（第 1-16 周 / 单周 / 排除周）。
 * 三条边界（需求定义书 v1.2 §4.1，已写成单测）：
 * - 判定顺序固定 范围 → 单双周 → 排除周，**排除周是否决票**，被子规则救不回来；
 * - 单双周以**学期第几周**为基准（第 1 周为单周），不是日历年周；
 * - `termWeekOf ≤ 0`（开学前）**不产生 occurrence**，不假装第 1 周。
 * 信息不足的取舍：带了 `weeks` 却没给开学日时，**按每周都上展开** ——
 * 宁可多排一次让用户自己看，也不要因为缺一个设置让整门课从时间轴上消失
 * （与需求 §4.1③「误报 vs 静默漏」的代价不对称判断一致）。
 */
export function expandOccurrences(
  task: Task,
  rangeStart: Date,
  rangeEnd: Date,
  termStartDayKey?: string | null,
): TaskOccurrence[] {
  const rangeStartMs = rangeStart.getTime();
  const rangeEndMs = rangeEnd.getTime();
  if (!Number.isFinite(rangeStartMs) || !Number.isFinite(rangeEndMs)) {
    throw new TypeError("expandOccurrences 需要有效的窗口起止时间");
  }
  if (rangeEndMs <= rangeStartMs) return [];

  const startMs = parseIsoToMs(task.start);
  const endMs = parseIsoToMs(task.end);
  if (startMs === null || endMs === null || endMs <= startMs) {
    // 没有具体时段的重复安排（例如"每周交一次作业"）不展开成时间块，
    // 它该由截止规则负责，硬造一个时段只会制造假冲突
    return [];
  }

  const own: TaskOccurrence = {
    taskId: task.id,
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
  };
  if (task.repeat === null) return [own];

  const byDay = new Set(task.repeat.byDay);
  if (byDay.size === 0) return [];

  // 重复时段的"时刻"与"时长"取自任务自己的那一行：08:00–09:40 每周二
  const minuteOfDay = minutesFromLocalMidnight(startMs);
  const durationMs = endMs - startMs;
  const firstDayKey = dayKeyOf(rangeStartMs);
  const weeks = task.repeat.weeks ?? null;

  const occurrences: TaskOccurrence[] = [];
  for (let offset = 0; offset < MAX_EXPAND_DAYS; offset += 1) {
    const dayKey = addDaysToKey(firstDayKey, offset);
    const dayStartMs = msFromDayKey(dayKey, 0);
    if (dayStartMs >= rangeEndMs) break;
    if (!byDay.has(isoWeekdayOf(dayStartMs))) continue;
    if (weeks !== null && termStartDayKey) {
      // 开学前的那几天不假装是第 1 周：课件表里根本没有这一节
      if (termWeekOf(dayKey, termStartDayKey) <= 0) continue;
      if (!dayInWeekSpec(dayKey, termStartDayKey, weeks)) continue;
    }
    const occurrenceStartMs = dayStartMs + minuteOfDay * MS_MINUTE;
    const occurrenceEndMs = occurrenceStartMs + durationMs;
    // 与窗口求交：跨窗口边界的时段只要碰到窗口就保留
    if (occurrenceStartMs >= rangeEndMs || occurrenceEndMs <= rangeStartMs) continue;
    occurrences.push({
      taskId: task.id,
      start: new Date(occurrenceStartMs).toISOString(),
      end: new Date(occurrenceEndMs).toISOString(),
    });
  }
  return occurrences;
}
