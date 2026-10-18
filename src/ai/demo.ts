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
/** 「下午4点」「9点」——中文口语时间，无分钟 */
const HOUR_ONLY_RE = /(\d{1,2})\s*[点时時]/;
/** 「本月底」「月底」——按当月最后一天 23:59 处理 */
const MONTH_END_RE = /(?:本月|这个月|当月)?月底/;
const TODAY_RE = /今天|今晚|今日/;
const TOMORROW_RE = /明天|明晚/;
const URGENT_RE = /紧急|必须|马上|立刻|!|！|DDL|ddl|截止/;
const FLEX_RE = /有空|尽量|可选|顺带|如果时间允许/;
const DEADLINE_RE = /(?:截止|ddl|DDL|之前|前完成|前交|前提交|前发|前上传)/;
/** 口语时段：「下午4点到6点」「9点半到11点」 */
const POINT_RANGE_RE = /(\d{1,2})\s*[点时](?:半)?\s*[-–—~～至到]\s*(\d{1,2})\s*[点时](?:半)?/;
/** 下午/晚上 → 小时 +12 */
const PM_RE = /下午|晚上|傍晚|晚间/;

/** 完整 ISO 日期（2026-10-25），必须优先于「10月25日」这类短式匹配，否则 2026 会被当成月份 */
const ISO_DATE_RE = /(\d{4})-(\d{2})-(\d{2})/;
/** 中文/短式日期：10月25日、10-25、10/25 */
const SHORT_DATE_RE = /(\d{1,2})\s*[月/-]\s*(\d{1,2})\s*[日号]?/;
/** 星期：「周三」「每周三」「下周三」「下下周三」「这周六」 */
const WEEKDAY_RE = /(下下|下|本|这|每)?\s*(?:周|星期)\s*([一二三四五六日天])/;
/** 更正行：「【更正】」「【再更正】」「（更正）」——应并入上一条任务，不新增 */
const CORRECTION_RE = /^\s*[【（(]?\s*再?更正\s*[】）)]?/;

const WEEKDAY_INDEX: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0,
};


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
    const isCorrection = CORRECTION_RE.test(line);
    /** 星期解析：「每周三」「下周三」「这周六」→ 具体日期；解析到即为"相对日期"，需人工确认 */
    const weekday = resolveWeekday(line, dayKey);
    const baseDay = weekday?.date ?? (TOMORROW_RE.test(line) ? shiftDay(dayKey, 1) : dayKey);

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
    } else if (POINT_RANGE_RE.test(line)) {
      // 口语时段："下午4点到6点"（含上午/下午换算）
      const pointRange = POINT_RANGE_RE.exec(line);
      const shift = PM_RE.test(line) ? 12 : 0;
      const rawStart = Number.parseInt(pointRange?.[1] ?? "0", 10);
      const rawEnd = Number.parseInt(pointRange?.[2] ?? "0", 10);
      const h1 = rawStart < 12 ? rawStart + shift : rawStart;
      const h2 = rawEnd < 12 ? rawEnd + shift : rawEnd;
      start = isoAt(baseDay, h1 * 60);
      end = isoAt(baseDay, h2 * 60);
      durationMin = Math.max(0, (h2 - h1) * 60) || 60;
    } else {
      const single = SINGLE_TIME_RE.exec(line) ?? HOUR_ONLY_RE.exec(line);
      if (single) {
        const rawHour = Number.parseInt(single[1] ?? "0", 10);
        const m = Number.parseInt(single[2] ?? "0", 10);
        // 下午/晚上且小时 < 12 → 换算 24 小时制（"下午3点" = 15:00）
        const h = PM_RE.test(line) && rawHour < 12 ? rawHour + 12 : rawHour;
        durationMin = extractDuration(line) ?? 60;
        start = isoAt(baseDay, h * 60 + m);
        end = isoAt(baseDay, h * 60 + m + durationMin);
      }
    }

    let deadline: string | null = null;
    const isoDate = ISO_DATE_RE.exec(line);
    const shortDate = SHORT_DATE_RE.exec(line);
    if (DEADLINE_RE.test(line)) {
      if (isoDate) {
        // 优先完整 ISO 日期，避免把 2026 当成月份（旧实现会算出 2028 年）
        deadline = new Date(
          Number(isoDate[1]),
          Number(isoDate[2]) - 1,
          Number(isoDate[3]),
          23, 59, 0, 0,
        ).toISOString();
      } else if (MONTH_END_RE.test(line)) {
        // 「本月底」= 当月最后一天 23:59（用 Date 的"下月第 0 天"取月末，避免手写月份天数表）
        const base = new Date(msFromDayKey(dayKey, 0));
        const monthEnd = new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 0, 0);
        deadline = monthEnd.toISOString();
      } else if (shortDate) {
        const month = Number.parseInt(shortDate[1] ?? "1", 10);
        const day = Number.parseInt(shortDate[2] ?? "1", 10);
        const baseYear = Number.parseInt(dayKey.slice(0, 4), 10);
        let candidate = new Date(baseYear, month - 1, day, 23, 59, 0, 0);
        // 跨年保护：算出来的日期已经过去 → 顺延一年（12 月看到「1 月 5 日」应当是明年）
        if (candidate.getTime() < msFromDayKey(dayKey, 0)) {
          candidate = new Date(baseYear + 1, month - 1, day, 23, 59, 0, 0);
        }
        deadline = candidate.toISOString();
      } else {
        deadline = isoAt(shiftDay(baseDay, TODAY_RE.test(line) ? 0 : 1), 23 * 60 + 59);
      }
    }

    if (start === null && durationMin === 0) durationMin = extractDuration(line) ?? 0;

    const title = cleanTitle(line);
    if (title.length === 0) continue;

    // 更正行不新增任务：把时间/时长覆盖到上一条，并把它标成待确认（发生过更正＝不确定）
    if (isCorrection) {
      const previous = drafts[drafts.length - 1];
      if (previous) {
        if (start !== null) {
          previous.start = start;
          previous.end = end;
          previous.durationMin = Math.max(durationMin, 15);
        }
        previous.needsReview = true;
        previous.rawTextOrigin = `${previous.rawTextOrigin ?? ""}\n${line}`.slice(0, 500);
      }
      continue;
    }

    drafts.push({
      title: title.slice(0, 200),
      start,
      end,
      durationMin: start === null ? durationMin : Math.max(durationMin, 15),
      deadline,
      priority: URGENT_RE.test(line) ? 1 : FLEX_RE.test(line) ? 3 : 2,
      rawTextOrigin: line.slice(0, 500),
      // 没有明确时段，或日期是靠「周三/下周」这类相对表述推出来的 → 需要人工确认
      needsReview: start === null || weekday !== null,
      // 规则版解析不识别周期安排，一律单次（模型版才可能给 repeat）
      repeat: null,
    });
  }

  return drafts;
}

/** 解析「周三 / 每周三 / 下周三 / 这周六」→ 具体日期（相对 DEMO_NOW，不读系统时钟） */
function resolveWeekday(line: string, dayKey: string): { date: string; weekly: boolean } | null {
  const match = WEEKDAY_RE.exec(line);
  if (!match) return null;
  const weekdayChar = match[2];
  if (weekdayChar === undefined) return null;
  const target = WEEKDAY_INDEX[weekdayChar];
  if (target === undefined) return null;

  const base = new Date(msFromDayKey(dayKey, 0));
  const current = base.getDay(); // 0=周日
  let delta = (target - current + 7) % 7;
  const prefix = match[1] ?? "";
  if (prefix === "下") delta += 7;
  if (prefix === "下下") delta += 14;

  return { date: shiftDay(dayKey, delta), weekly: prefix === "每" };
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
