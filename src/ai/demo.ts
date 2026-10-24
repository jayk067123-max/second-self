import type { Task, TaskDraft } from "@/domain/schemas/task";
import { buildLocalProposals, type ReplanPlan } from "@/domain/reflow";
import { DEFAULT_DETECT_CONFIG } from "@/domain/conflicts";
import { TERM_START_DAY_KEY } from "@/shared/constants";
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
const SHORT_DATE_RE = /(?<![0-9:：])(1[0-2]|0?[1-9])\s*[月/-]\s*(3[01]|[12][0-9]|0?[1-9])\s*[日号]?/;
/** 星期：「周三」「每周三」「下周三」「下下周三」「这周六」 */
const WEEKDAY_RE = /(下下|下|本|这|每)?\s*(?:周|星期)\s*([一二三四五六日天])/;
/** 更正行：「【更正】」「【再更正】」「（更正）」——应并入上一条任务，不新增 */
const CORRECTION_RE = /^\s*[【（(]?\s*再?更正\s*[】）)]?/;
/** 条件性/不确定表述：「下雨顺延」「具体时间等通知」「待定」——有这些一律不许当确定结果 */
const CONDITIONAL_RE = /顺延|等通知|另行通知|待定|暂定|具体时间|未定|看情况/;

/** 更正行：「【更正】」「【再更正】」「（更正）」——应并入上一条任务，不新增 */

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
    const explicit = ISO_DATE_RE.exec(line);
    const short = explicit ? null : SHORT_DATE_RE.exec(line);
    let explicitDay = explicit ? explicit[0] : null;
    if (short) {
      const year = Number(dayKey.slice(0, 4));
      explicitDay = year + "-" + String(Number(short[1])).padStart(2, "0") + "-" + String(Number(short[2])).padStart(2, "0");
      if (explicitDay < dayKey) explicitDay = (year + 1) + explicitDay.slice(4);
    }
    const baseDay = explicitDay ?? weekday?.date ?? (TOMORROW_RE.test(line) ? shiftDay(dayKey, 1) : /后天/.test(line) ? shiftDay(dayKey, 2) : dayKey);
    // 提前把"是否相对日期推出来 / 是否周期规则"定下来，避免后面的类型收窄把 weekday 弄成 never
    const weeklyRepeat =
      weekday !== null && weekday.weekly
        ? { kind: "weekly" as const, byDay: [weekday.byDay] }
        : null;

    let start: string | null = null;
    let end: string | null = null;
    let durationMin = 0;
    /** 时长是默认值估出来的（原文没给）→ 入库后界面必须显示「约 N 分钟 · 待确认」 */
    let durationInferred = false;

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
        const explicitDuration = extractDuration(line);
        // EXPECTED 表：只给开始时间时默认 90 分钟（志愿者培训）
        durationMin = explicitDuration ?? 90;
        start = isoAt(baseDay, h * 60 + m);
        end = isoAt(baseDay, h * 60 + m + durationMin);
        // 时长是估的 → 打标记，界面会显示成「约 90 分钟 · 待确认」，不许假装确定
        if (explicitDuration === null) durationInferred = true;
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

    // 「10月31日下午3点前提交」是**截止**不是开始：把时段搬到 deadline，别占时间轴。
    // 注意日期要取原文里的 10-31，而不是 dayKey（否则会变成"今天 15:00 截止"）
    if (DEADLINE_RE.test(line) && /前/.test(line)) {
      const isoD = ISO_DATE_RE.exec(line);
      const shortD = SHORT_DATE_RE.exec(line);
      const clock = SINGLE_TIME_RE.exec(line) ?? HOUR_ONLY_RE.exec(line);
      let deadlineDay: string | null = null;
      if (isoD) {
        deadlineDay = `${isoD[1]}-${isoD[2]}-${isoD[3]}`;
      } else if (shortD) {
        const year = Number.parseInt(dayKey.slice(0, 4), 10);
        const mm = String(Number.parseInt(shortD[1] ?? "1", 10)).padStart(2, "0");
        const dd = String(Number.parseInt(shortD[2] ?? "1", 10)).padStart(2, "0");
        deadlineDay = `${year}-${mm}-${dd}`;
      }
      if (clock) {
        const rawHour = Number.parseInt(clock[1] ?? "0", 10);
        const minute = Number.parseInt(clock[2] ?? "0", 10);
        const hour = PM_RE.test(line) && rawHour < 12 ? rawHour + 12 : rawHour;
        const day = deadlineDay ?? baseDay;
        deadline = isoAt(day, hour * 60 + minute);
      } else if (deadline === null && deadlineDay !== null) {
        deadline = isoAt(deadlineDay, 23 * 60 + 59);
      }
      start = null;
      end = null;
      durationMin = 0;
    }

    if (start === null && durationMin === 0) durationMin = extractDuration(line) ?? 0;

    // 「下周一交」「周五之前」：有星期 + 交付类动词 → 视为当天 23:59 截止
    if (deadline === null && weekday !== null && /(交|提交|截止|前|答辩|报名|上传)/.test(line)) {
      deadline = isoAt(weekday.date, 23 * 60 + 59);
    }

    // **标题保留原文**：时间数字是附加信息，不许把原文掏空
    const title = normalizeTitle(line);
    if (title.length === 0) continue;

    // 更正行不新增任务：把时间/截止覆盖到上一条，并标成待确认（发生过更正＝不确定）
    if (isCorrection) {
      const previous = drafts[drafts.length - 1];
      if (previous) {
        if (start !== null) {
          previous.start = start;
          previous.end = end;
          previous.durationMin = Math.max(durationMin, 15);
        }
        if (deadline !== null) previous.deadline = deadline;
        // 归并成功就**不再**标 needsReview（选题官口径：更正已经把字段改成确定值，
        // 再挂黄标等于让用户重复核对同一件事）。字段没能覆盖成功时才保留待确认。
        if (start === null && deadline === null) previous.needsReview = true;
        previous.rawTextOrigin = `${previous.rawTextOrigin ?? ""}\n${line}`.slice(0, 500);
      }
      continue;
    }

    // 群消息抬头/接龙/纯叙述句不成为任务：**只有含时间或截止线索的句子才是任务**。
    // 判的是"原文里有没有时间线索"，不是"我们敢不敢填 start"。
    const hasClockCue =
      RANGE_RE.test(line) ||
      POINT_RANGE_RE.test(line) ||
      SINGLE_TIME_RE.test(line) ||
      HOUR_ONLY_RE.test(line);
    const hasDeadlineCue =
      DEADLINE_RE.test(line) &&
      (ISO_DATE_RE.test(line) || SHORT_DATE_RE.test(line) || MONTH_END_RE.test(line) || weekday !== null);
    // 相对日期词（下周/本月/月底…）与"弹性待办"（有空再做）仍算有日期线索：
    // 它们不是叙述句，只是日期不够具体 —— 保留成任务并标 needsReview，比直接丢掉诚实
    const hasRelativeDateCue = /下周|本周|这周|下个月|下月|本月|月底|近期|之后|以后/.test(line);
    const hasFlexibleCue = FLEX_RE.test(line);
    // 「紧急：交周报」这类有明确行动与紧迫度、但没写时间的行，仍是任务（只是 needsReview）
    const hasUrgentCue = URGENT_RE.test(line);
    if (
      !hasClockCue &&
      !hasDeadlineCue &&
      !hasRelativeDateCue &&
      !hasFlexibleCue &&
      !hasUrgentCue &&
      weekday === null
    ) {
      continue;
    }

    // 地点：从原文里抽（影响缓冲规则的同地点/跨校区判定）
    const locationMatch = /(二教|三教|一教|四教|实验楼|图书馆|教学楼|综合楼|体育馆)\s*\d*/.exec(line);
    // 固定课：补课/调课这类"学校排的、不能动"的安排（用户权威标记，规则版可判）
    const locked = /补课|调课/.test(line) && start !== null;
    // 弹性：作业/材料/表格/答辩这类可顺延的交付物
    const flexible =
      !locked &&
      /(推迟|截止|提交|上?交|签字|顺延|申请|报名|答辩|作业|表格)/.test(line);

    drafts.push({
      title: title.slice(0, 200),
      start,
      end,
      durationMin: start === null ? durationMin : Math.max(durationMin, 15),
      deadline,
      priority: URGENT_RE.test(line) ? 1 : FLEX_RE.test(line) ? 3 : 2,
      rawTextOrigin: line.slice(0, 500),
      // 只有"原文本身说不清"才需要人工确认：
      // 条件性表述（顺延/等通知），或既没有具体日期也没有时段的条目。
      // 星期/相对日期能算准的、时长按默认值估的，都不再打扰用户。
      needsReview:
        CONDITIONAL_RE.test(line) ||
        durationInferred ||
        (weekday === null && deadline === null && start === null),
      // 时长是估的 → 界面上要显示成「约 N 分钟 · 待确认」，不能只留在数据里
      durationInferred,
      // 「每周三」→ 周期规则；一条重复安排只存一行，不展开
      repeat: weeklyRepeat,
      location: locationMatch ? locationMatch[0].replace(/\s+/g, "") : null,
      locked,
      flexible,
    });
  }

  return drafts;
}

/** 解析「周三 / 每周三 / 下周三 / 这周六」→ 具体日期（相对注入的 dayKey，不读系统时钟） */
function resolveWeekday(
  line: string,
  dayKey: string,
): { date: string; weekly: boolean; byDay: number } | null {
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
  const currentIso = current === 0 ? 7 : current;
  const targetIso = target === 0 ? 7 : target;
  if (prefix === "本" || prefix === "这") delta = targetIso - currentIso;
  if (prefix === "下") delta = 7 + targetIso - currentIso;
  if (prefix === "下下") delta = 14 + targetIso - currentIso;

  // byDay 用 ISO 口径：周一=1 … 周日=7
  const isoWeekday = target === 0 ? 7 : target;
  return { date: shiftDay(dayKey, delta), weekly: prefix === "每", byDay: isoWeekday };
}

/** 重排兜底：直接复用 domain 的确定性方案生成器 */
export function demoReplanPlans(tasks: readonly Task[], dayKey: string, actualNow?: Date, termStartDayKey: string | null = TERM_START_DAY_KEY): ReplanPlan[] {
  // 兜底不再自己造"计划"：走 reflow 的 buildLocalProposals → 与模型提议共用同一套裁决器，
  // 效果闸（冲突数必须下降、locked 不动、18 条不变）照旧生效，不留第二条判定路径。
  const now = actualNow ?? new Date(msFromDayKey(dayKey, 9 * 60));
  const inputs = {
    now,
    detect: { ...DEFAULT_DETECT_CONFIG, termStartDayKey },
    targetDayKey: dayKey,
  };
  const accepted = buildLocalProposals(tasks, inputs);
  const byId = new Map(tasks.map((task) => [task.id, task]));

  return accepted
    .map((item, index) => {
      const blocks = item.tasksAfter
        .filter((after) => {
          const before = byId.get(after.id);
          return (
            after.start !== null &&
            after.end !== null &&
            (before?.start !== after.start || before?.end !== after.end)
          );
        })
        .map((after) => ({ taskId: after.id, start: after.start as string, end: after.end as string }));
      return {
        id: item.proposal.id || `local-${index + 1}`,
        title: item.proposal.label,
        rationale:
          item.proposal.sacrifices.length > 0
            ? `牺牲：${item.proposal.sacrifices.join("、")}`
            : "本地兜底：最小改动，冲突数下降才上桌",
        blocks,
      };
    })
    .filter((plan) => plan.blocks.length > 0)
    .filter((plan, index, plans) => plans.findIndex(other => JSON.stringify(other.blocks) === JSON.stringify(plan.blocks)) === index);
}

function extractDuration(line: string): number | null {
  const min = DURATION_MIN_RE.exec(line);
  if (min) return Number.parseInt(min[1] ?? "0", 10);
  const hour = DURATION_HOUR_RE.exec(line);
  if (hour) return Math.round(Number.parseFloat(hour[1] ?? "0") * 60);
  return null;
}

/**
 * 标题归一化：**只去掉序号与更正标记，保留原文全部内容（含时间数字）**。
 * 提取出来的 start/end/deadline 是附加字段，绝不把原文掏空 ——
 * 用户要能在任务卡上读到原句，判断 AI 有没有理解错。
 */
function normalizeTitle(line: string): string {
  return line
    .replace(CORRECTION_RE, " ")
    // 只剥"5. " / "5、" 这种序号，别把 "10月31日" 的 10 当成序号吃掉
    .replace(/^\d{1,2}\s*[.、)）]\s*/, "")
    .replace(/^[-*·•\s]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 200);
}

function isoAt(dayKey: string, minutes: number): string {
  return new Date(msFromDayKey(dayKey, minutes)).toISOString();
}

function shiftDay(dayKey: string, days: number): string {
  return new Date(msFromDayKey(dayKey, 0) + days * 24 * 60 * 60_000)
    .toLocaleDateString("sv-SE")
    .slice(0, 10);
}
