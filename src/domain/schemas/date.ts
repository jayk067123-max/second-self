import { z } from "zod";

export const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const DayKeySchema = z.iso.date("日期必须是有效的 YYYY-MM-DD");
export const TimestampSchema = z.union([
  DayKeySchema,
  z.iso.datetime({ offset: true, local: true }),
]).refine(value => Number.isFinite(Date.parse(value)), "时间不是合法的时间戳");

export function isValidDayKey(value: unknown): value is string {
  return DayKeySchema.safeParse(value).success;
}

export function isValidTimestamp(value: unknown): value is string {
  return TimestampSchema.safeParse(value).success;
}
