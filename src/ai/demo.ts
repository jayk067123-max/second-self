import type { Task, TaskDraft } from "@/domain/schemas/task";
import { buildLocalPlans, type ReplanPlan } from "@/domain/planner";
import { DEFAULT_PLAN_OPTIONS } from "@/domain/planner";
import { msFromDayKey } from "@/domain/time";

/**
 * demo 模式兜底：不调用任何模型，用确定性规则产出**结构合法**的结果。
 * 存在的意义：评委机器可能没有 API Key，但全链路必须照样能跑通。
 */

const RANGE_RE = /(\d{1,2})[:：](\d{2})\s*[-–—~～至到]\s*(\d{1,2})[:：](\d{2})/;
const DURATION_MIN_RE = /(\d{1,3})\s*(?:分钟|min|mins)/i;
const DURATION_HOUR_RE = /(\d+(?:\.\d+)?)\s*(?:小时|h\b|hr)/i;
const SINGLE_TIME_RE = /(\d{1,2})[:：](\d{2})/;
const TODAY_RE = /今天|今晚|今日/;
const TOMORROW_RE = /明天|明晚/;
const URGENT_RE = /紧急|必须|马上|立刻|!|！|DDL|ddl|截止/;
const FLEX_RE = /有空|尽量|可选|顺带|如果时间允许/;
const DEADLINE_RE = /(?:截止|ddl|DDL|之前|前完成|前交)/;

/**
 * 把粘贴文本解析成 TaskDraft（规则版）。
 * @param dayKey 今天（由调用方注入，保证可测与确定性）
 */
export function demoParseTasks(text: string, dayKey: string): TaskDraft[] {
  const lines = text
    .split(/\r?\n|[；;]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 40);

  const drafts: TaskDraft[] = [];

  for (const line of lines) {
    const baseDay = TOMORROW_RE.test(line) ? shiftDay(dayKey, 1) : dayKey;

    let start: string | null = null;
    let end: string | null = null;
    let durationMin = 0;

    const range = RANGE_RE.exec(line);
    if (range) {
      const [h1, m1, h2, m2] = [range[1], range[2], range[3], range[4]].map((v) =>
        Number.parseInt(v ?? "0", 10),
      ) as [number, number, number, number];
      start = isoAt(baseDay, h1 * 60 + m1);
      end = isoAt(baseDay, h2 * 60 + m2);
      durationMin = Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1));
      if (durationMin === 0) durationMin = 60;
    } else {
      const single = SINGLE_TIME_RE.exec(line);
      if (single) {
        const h = Number.parseInt(single[1] ?? "0", 10);
        const m = Number.parseInt(single[2] ?? "0", 10);
        durationMin = extractDuration(line) ?? 60;
        start = isoAt(baseDay, h * 60 + m);
        end = isoAt(baseDay, h * 60 + m + durationMin);
      }
    }

    let deadline: string | null = null;
    const explicitDdl =
      /(\d{1,2})\s*[月/-]\s*(\d{1,2})\s*[日号]?/.exec(line) ?? /(\d{4})-(\d{2})-(\d{2})/.exec(line);
    if (explicitDdl && DEADLINE_RE.test(line)) {
      const month = Number.parseInt(explicitDdl[1] ?? "1", 10);
      const day = Number.parseInt(explicitDdl[2] ?? "1", 10);
      const year = Number.parseInt(dayKey.slice(0, 4), 10);
      deadline = new Date(year, month - 1, day, 23, 59, 0, 0).toISOString();
    } else if (DEADLINE_RE.test(line)) {
      deadline = isoAt(shiftDay(baseDay, TODAY_RE.test(line) ? 0 : 1), 23 * 60 + 59);
    }

    if (start === null && durationMin === 0) durationMin = extractDuration(line) ?? 0;

    const title = cleanTitle(line);
    if (title.length === 0) continue;

    drafts.push({
      title: title.slice(0, 200),
      start,
      end,
      durationMin: start === null ? durationMin : Math.max(durationMin, 15),
      deadline,
      priority: URGENT_RE.test(line) ? 1 : FLEX_RE.test(line) ? 3 : 2,
      rawTextOrigin: line.slice(0, 500),
      // 原文没给明确时段 → 需要人工确认（修正表里会高亮）
      needsReview: start === null,
      // 规则版解析不识别周期安排，一律单次（模型版才可能给 repeat）
      repeat: null,
    });
  }

  return drafts;
}

/** 重排兜底：直接复用 domain 的确定性方案生成器 */
export function demoReplanPlans(tasks: readonly Task[], dayKey: string): ReplanPlan[] {
  return buildLocalPlans(tasks, dayKey, DEFAULT_PLAN_OPTIONS);
}

function extractDuration(line: string): number | null {
  const min = DURATION_MIN_RE.exec(line);
  if (min) return Number.parseInt(min[1] ?? "0", 10);
  const hour = DURATION_HOUR_RE.exec(line);
  if (hour) return Math.round(Number.parseFloat(hour[1] ?? "0") * 60);
  return null;
}

function cleanTitle(line: string): string {
  return line
    .replace(RANGE_RE, " ")
    .replace(SINGLE_TIME_RE, " ")
    .replace(DURATION_MIN_RE, " ")
    .replace(DURATION_HOUR_RE, " ")
    .replace(/\d{4}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{1,2}/g, " ")
    .replace(/\d{1,2}\s*[月/-]\s*\d{1,2}\s*[日号]?/g, " ")
    .replace(/(截止|DDL|ddl|之前|前完成|前交|前发)/g, " ")
    .replace(/^(今天|明天|后天|今晚|明晚)[,，:：]?\s*/, "")
    .replace(/^[-*·•\d.、)\s]+/, "")
    .replace(/[（(]\s*[)）]/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s:：,，、-]+|[\s:：,，、-]+$/g, "")
    .trim();
}

function isoAt(dayKey: string, minutes: number): string {
  return new Date(msFromDayKey(dayKey, minutes)).toISOString();
}

function shiftDay(dayKey: string, days: number): string {
  return new Date(msFromDayKey(dayKey, 0) + days * 24 * 60 * 60_000)
    .toLocaleDateString("sv-SE")
    .slice(0, 10);
}
