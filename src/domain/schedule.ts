import { z } from "zod";
import { addDaysToKey, msFromDayKey } from "./time";

/**
 * 课表周次与重传覆盖 —— P0 地基，纯函数层。
 *
 * 三件事，互不耦合，都不碰 `expandOccurrences` / `conflicts` / `reflow`：
 *   1. 周次范围（WeekSpec）：第 1-16 周、单双周、指定排除周
 *   2. 学期周换算：某个 dayKey 落在第几周
 *   3. 课表重传覆盖：新旧两版课表做 diff，产出「新增/调走/删除/未变」计划
 *
 * 为什么第 3 件事放在 domain 而不是 store：
 * 它是**纯数据比对**，没有 IO、不看时钟，必须能单测。store 只负责执行 plan
 * （加/改/删任务），UI 只负责把 summary 显示成「新增 2 节、调走 1 节」。
 *
 * 边界：本文件**不改**展开逻辑。重复任务怎么展开仍然只由
 * `time.ts` 的 `expandOccurrences` 决定；这里只回答"第 N 周到底上不上"。
 */

/* ─────────────────────────── 周次范围 ─────────────────────────── */

/**
 * 周次范围。
 * `parity` 处理「单周/双周」课（大学里非常常见：第 1-16 周单周上）；
 * `except` 处理调休/停课，比让人手工改 `from/to` 更安全 —— 排除周是显式记录，
 * 复课把那一周从数组里删掉即可，不会丢信息。
 */
export const WeekSpecSchema = z
  .object({
    from: z.number().int().min(1).max(30),
    to: z.number().int().min(1).max(30),
    parity: z.enum(["all", "odd", "even"]).default("all"),
    except: z.array(z.number().int().min(1).max(30)).default([]),
  })
  .refine((spec) => spec.to >= spec.from, {
    message: "周次范围的结束周不能小于开始周",
    path: ["to"],
  });
export type WeekSpec = z.infer<typeof WeekSpecSchema>;

/** 上限：一学期不会超过 30 周，超出视为脏数据，不展开 */
export const MAX_TERM_WEEKS = 30;

/** 展开成具体周次列表（升序、去重、已剔除 except）。空数组表示"一周都不上" */
export function weeksInSpec(spec: WeekSpec): number[] {
  const except = new Set(spec.except);
  const weeks: number[] = [];
  for (let week = spec.from; week <= Math.min(spec.to, MAX_TERM_WEEKS); week += 1) {
    if (except.has(week)) continue;
    if (spec.parity === "odd" && week % 2 === 0) continue;
    if (spec.parity === "even" && week % 2 === 1) continue;
    weeks.push(week);
  }
  return weeks;
}

/** 第 `week` 周是否上这门课 */
export function isWeekActive(week: number, spec: WeekSpec): boolean {
  if (!Number.isInteger(week) || week < spec.from || week > spec.to) return false;
  if (spec.except.includes(week)) return false;
  if (spec.parity === "odd" && week % 2 === 0) return false;
  if (spec.parity === "even" && week % 2 === 1) return false;
  return true;
}

/** 人话：第1-16周 / 第1-16周·单周 / 第1-16周（跳过第 8 周） */
export function formatWeekSpec(spec: WeekSpec): string {
  const parity = spec.parity === "odd" ? "·单周" : spec.parity === "even" ? "·双周" : "";
  const sortedExcept = [...new Set(spec.except)].sort((a, b) => a - b);
  const except =
    sortedExcept.length === 0
      ? ""
      : sortedExcept.length === 1
        ? `（跳过第 ${sortedExcept[0]} 周）`
        : `（跳过第 ${sortedExcept.join("、")} 周）`;
  return `第${spec.from}-${spec.to}周${parity}${except}`;
}

/* ─────────────────────────── 学期周换算 ─────────────────────────── */

const MS_WEEK = 7 * 24 * 60 * 60_000;

/**
 * 某个 dayKey 落在学期的第几周（1 起）。
 * `termStartDayKey` 约定为**第 1 周周一**的日期 —— 由调用方给（通常是用户填的开学日），
 * 这里不猜、不读时钟。学期开始前的日期返回 ≤0 的数（调用方据此判"还没开学"）。
 */
export function termWeekOf(dayKey: string, termStartDayKey: string): number {
  const diff = msFromDayKey(dayKey, 0) - msFromDayKey(termStartDayKey, 0);
  return Math.floor(diff / MS_WEEK) + 1;
}

/** 第 `week` 周周一的 dayKey */
export function dayKeyOfTermWeek(termStartDayKey: string, week: number): string {
  return addDaysToKey(termStartDayKey, (week - 1) * 7);
}

/** 某一天是否被某段周次范围覆盖（组合上面两个函数，语义唯一） */
export function dayInWeekSpec(dayKey: string, termStartDayKey: string, spec: WeekSpec): boolean {
  return isWeekActive(termWeekOf(dayKey, termStartDayKey), spec);
}

/* ─────────────────────────── 课表覆盖 ─────────────────────────── */

/**
 * 一节可以独立调动的课（不是 Task：这里刻意不带 id/done/needsReview 等无关字段，
 * 这样 diff 逻辑能单独推理、单独测试）。
 */
export const TimetableBlockSchema = z.object({
  /** 已落库任务 id；全新导入的块没有 */
  taskId: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(200),
  /** ISO 星期：1=周一 … 7=周日 */
  weekday: z.number().int().min(1).max(7),
  /** 距零点分钟数（08:00 → 480） */
  startMinute: z.number().int().min(0).max(24 * 60),
  durationMin: z.number().int().min(1).max(24 * 60),
  location: z.string().trim().max(60).nullable().optional(),
});
export type TimetableBlock = z.infer<typeof TimetableBlockSchema>;

export type TimetableChangeKind = "added" | "updated" | "removed" | "unchanged";

export interface TimetableChange {
  kind: TimetableChangeKind;
  /** 归一化后的课程名（人话展示仍用 title） */
  title: string;
  before?: TimetableBlock;
  after?: TimetableBlock;
  /** 给「刚才改了什么」摘要用的一句话，不含技术词 */
  note: string;
}

export interface TimetablePlan {
  changes: TimetableChange[];
  summary: {
    added: number;
    /** 时间被挪动的（同一门课换了时段/星期） */
    updated: number;
    removed: number;
    unchanged: number;
    total: number;
  };
  /** 有新增或删除时为 true —— 这是"必须让用户看见"的信号 */
  hasDestructiveChange: boolean;
}

const NOISE_RE = /[\s\u3000,，。．.;；:：、!！?？"'“”‘’()（）[\]【】<>《》\-–—~～|/\\*#·•…]/g;

/** 课程名归一化：全角转半角、去标点空白、转小写。「高数」≠「高等数学」，不做同义合并 */
export function normalizeCourseTitle(title: string): string {
  return title
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(NOISE_RE, "")
    .toLowerCase();
}

/** 完全相同的判定口径：同名 + 同星期 + 同开始时间 + 同时长 + 同地点 */
function identical(a: TimetableBlock, b: TimetableBlock): boolean {
  return (
    normalizeCourseTitle(a.title) === normalizeCourseTitle(b.title) &&
    a.weekday === b.weekday &&
    a.startMinute === b.startMinute &&
    a.durationMin === b.durationMin &&
    (a.location ?? "") === (b.location ?? "")
  );
}

/** 片段距离：星期差按 1 天 1440 分钟折算，用来找"最像的那一节" */
function gap(a: TimetableBlock, b: TimetableBlock): number {
  return Math.abs(a.weekday - b.weekday) * 1440 + Math.abs(a.startMinute - b.startMinute);
}

function clockOf(block: TimetableBlock): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(block.startMinute / 60);
  const m = block.startMinute % 60;
  return `${pad(h)}:${pad(m)}`;
}

const WEEKDAY_LABEL = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const WEEKDAY_INDEX: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7,
};

/**
 * 旧课表 → 新课表的覆盖计划（纯函数，无 IO）。
 *
 * 三趟匹配，顺序固定，结果确定：
 *   1. 完全相同的配成 unchanged（先配掉，避免它们被后面当成"调走"）
 *   2. 剩下同名的按距离最近配对 → updated（换时段/换教室算"调走"，不算删了再新增）
 *   3. 剩余旧块 → removed，剩余新块 → added
 *
 * 为什么先配 unchanged 再配 updated：同一门课一周上两节时，
 * 直接按名字贪心配对会把"没变的"错配成"改了的"，摘要就会变成"调走 2 节"。
 *
 * 注意：本函数**不执行**任何修改，只产出计划。执行由 data 层做，
 * 这样「改了什么」摘要和「撤销」才可能是一份数据算出来的两个面。
 */
export function planTimetableCoverage(
  before: readonly TimetableBlock[],
  after: readonly TimetableBlock[],
): TimetablePlan {
  const oldRest = before.map((block) => ({ block, used: false }));
  const newRest = after.map((block) => ({ block, used: false }));
  const changes: TimetableChange[] = [];

  // 第 1 趟：完全相同的
  for (const o of oldRest) {
    const hit = newRest.find((candidate) => !candidate.used && identical(o.block, candidate.block));
    if (hit === undefined) continue;
    o.used = true;
    hit.used = true;
    changes.push({
      kind: "unchanged",
      title: hit.block.title,
      before: o.block,
      after: hit.block,
      note: `${hit.block.title} 没变（${WEEKDAY_LABEL[hit.block.weekday] ?? ""} ${clockOf(hit.block)}）`,
    });
  }

  // 第 2 趟：同名的按距离最近配对
  const candidates: Array<{ oi: number; ni: number; distance: number }> = [];
  for (const [oi, o] of oldRest.entries()) {
    if (o.used) continue;
    for (const [ni, candidate] of newRest.entries()) {
      if (candidate.used) continue;
      if (normalizeCourseTitle(o.block.title) !== normalizeCourseTitle(candidate.block.title)) continue;
      candidates.push({ oi, ni, distance: gap(o.block, candidate.block) });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.oi - b.oi || a.ni - b.ni);
  for (const pair of candidates) {
    const o = oldRest[pair.oi];
    const n = newRest[pair.ni];
    if (o === undefined || n === undefined || o.used || n.used) continue;
    o.used = true;
    n.used = true;
    changes.push({
      kind: "updated",
      title: n.block.title,
      before: o.block,
      after: n.block,
      note:
        `${n.block.title}：${WEEKDAY_LABEL[o.block.weekday] ?? ""} ${clockOf(o.block)} → ` +
        `${WEEKDAY_LABEL[n.block.weekday] ?? ""} ${clockOf(n.block)}`,
    });
  }

  // 第 3 趟：剩下的删/增
  for (const o of oldRest) {
    if (o.used) continue;
    changes.push({
      kind: "removed",
      title: o.block.title,
      before: o.block,
      note: `${o.block.title} 新课表里没有（${WEEKDAY_LABEL[o.block.weekday] ?? ""} ${clockOf(o.block)}）`,
    });
  }
  for (const n of newRest) {
    if (n.used) continue;
    changes.push({
      kind: "added",
      title: n.block.title,
      after: n.block,
      note: `${n.block.title} 新增（${WEEKDAY_LABEL[n.block.weekday] ?? ""} ${clockOf(n.block)}）`,
    });
  }

  const summary = {
    added: changes.filter((c) => c.kind === "added").length,
    updated: changes.filter((c) => c.kind === "updated").length,
    removed: changes.filter((c) => c.kind === "removed").length,
    unchanged: changes.filter((c) => c.kind === "unchanged").length,
    total: changes.length,
  };

  return {
    changes,
    summary,
    hasDestructiveChange: summary.added > 0 || summary.removed > 0,
  };
}

/** 摘要人话：「新增 2 节、调走 1 节、删除 0 节、未变 5 节」 */
export function formatTimetableSummary(plan: TimetablePlan): string {
  const { added, updated, removed, unchanged } = plan.summary;
  return `新增 ${added} 节、调走 ${updated} 节、删除 ${removed} 节、未变 ${unchanged} 节`;
}

/**
 * 把「周三 1-2 节」这类中文星期说成 ISO 星期号（1=周一）。
 * 只认单字星期，认不出返回 null —— 认不出就走 needsReview，不猜。
 */
export function weekdayFromLabel(label: string): number | null {
  const match = /(?:周|星期|礼拜)\s*([一二三四五六日天])/.exec(label);
  if (match?.[1] === undefined) return null;
  return WEEKDAY_INDEX[match[1]] ?? null;
}
