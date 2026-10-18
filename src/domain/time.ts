/**
 * 时间工具 —— 全部为纯函数，按**本地时区**计算（个人日程必须贴合用户所在时区）。
 * 不使用 Intl 以外的时间库，避免第三方依赖。
 */

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

export function todayKey(now: number = Date.now()): string {
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
