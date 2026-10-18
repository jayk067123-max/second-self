import type { TaskDraft } from "./schemas/task";
import { addDaysToKey, dayKeyOf, msFromDayKey, weekdayLabel } from "./time";

/**
 * 缺信息追问 —— P0-12 的纯逻辑部分（007 卡 `/docs/prompts/007-missing-info-clarify.md`）。
 *
 * 分三层，全部纯函数，UI 只负责画：
 *   1. `diagnoseDraft`：这条草稿缺什么（日期 / 时长 / 截止）
 *   2. `buildQuestions`：按"缺了最影响排期"的顺序生成**一屏一问**的问句
 *   3. `answerToPatch` + `mergeDraftPatch`：答案落成字段 patch
 *
 * 两条硬约束（Prompt官 在 007 里拦下的双写 bug）：
 *   - 追问面板**不直接写库**，只产出 patch；落库永远走同一个 store action；
 *   - 修正表与追问面板改同一条草稿，必须调用**同一个** `mergeDraftPatch`。
 *
 * 口径（选题官 TBD-2a 定稿）：**一屏一问**，没有"最多 3 条"这种没出处的上限；
 * 用户随时可以「剩下的我自己改」退出——退出不是失败，已收进来的照样入库。
 *
 * 刻意**不问地点**：`TaskDraft` 契约里没有 `location` 字段（只有落库后的 Task 有），
 * 问了也写不进去。要么给 Draft 加字段（那是逻辑手的 schema），要么让用户走「手动新增」。
 * 宁可不问，也不问一个答了没用的题。
 */

export type MissingField = "date" | "duration" | "deadline";

export interface DraftDiagnosis {
  missing: MissingField[];
  /** 完全没时间线索：连日期都没有 */
  noDate: boolean;
  needsAsking: boolean;
}

export interface ClarifyOption {
  id: string;
  /** 按钮文案（短，竖屏一行放得下） */
  label: string;
  hint?: string;
}

export interface ClarifyQuestion {
  /** 稳定 id，等于 `kind`；同一条草稿同一时刻只问一个问题 */
  id: string;
  kind: MissingField;
  /** 问句本身，人话，不带字段名 */
  prompt: string;
  options: ClarifyOption[];
  /** 允许自由输入时的 placeholder；null 表示只让点选 */
  freeInputPlaceholder: string | null;
}

export type ClarifyAnswer =
  | { source: "option"; optionId: string }
  | { source: "free"; text: string }
  | { source: "skip" };

/* ─────────────────────────── 诊断 ─────────────────────────── */

/**
 * 这条草稿缺什么 —— 只有三种情况会问：
 *   1. 既没时段也没截止 → 缺日期
 *   2. 有时段但时长为 0 → 缺时长
 *   3. 只有截止、没有时段 → **不问**（这是合法的"DDL 任务"，问了只会逼用户编时间）
 */
export function diagnoseDraft(draft: TaskDraft): DraftDiagnosis {
  const missing: MissingField[] = [];
  const hasStart = draft.start !== null;
  const hasDeadline = draft.deadline !== null;

  if (!hasStart && !hasDeadline) missing.push("date");
  if (hasStart && draft.durationMin <= 0) missing.push("duration");

  return { missing, noDate: !hasStart && !hasDeadline, needsAsking: missing.length > 0 };
}

/* ─────────────────────────── 问句生成 ─────────────────────────── */

const QUESTION_ORDER: readonly MissingField[] = ["date", "duration", "deadline"];

/** 生成问句列表（一屏一问：UI 只取第一个，答完再取下一个）。够了就返回空数组 */
export function buildQuestions(draft: TaskDraft, dayKey: string): ClarifyQuestion[] {
  return diagnoseDraft(draft)
    .missing.slice()
    .sort((a, b) => QUESTION_ORDER.indexOf(a) - QUESTION_ORDER.indexOf(b))
    .map((field) =>
      field === "date" ? dateQuestion(dayKey) : field === "duration" ? durationQuestion() : deadlineQuestion(dayKey),
    );
}

function dateQuestion(dayKey: string): ClarifyQuestion {
  return {
    id: "date",
    kind: "date",
    prompt: "这件事是哪天的？",
    options: [
      { id: "today", label: "今天", hint: dayKey },
      { id: "tomorrow", label: "明天", hint: addDaysToKey(dayKey, 1) },
      { id: "dayAfter", label: "后天", hint: addDaysToKey(dayKey, 2) },
      { id: "keep", label: "先不指定", hint: "先进清单，之后再补" },
    ],
    freeInputPlaceholder: "也可以直接说：10月25日 / 10-25",
  };
}

function durationQuestion(): ClarifyQuestion {
  return {
    id: "duration",
    kind: "duration",
    prompt: "大概要花多久？",
    options: [
      { id: "m30", label: "半小时" },
      { id: "m60", label: "1 小时" },
      { id: "m90", label: "1.5 小时" },
      { id: "m120", label: "2 小时" },
    ],
    freeInputPlaceholder: "也可以直接说：45 分钟",
  };
}

/** 兜底问句：只有截止时间、没有时段的草稿，用户主动要求"排个时间"时才问 */
export function deadlineQuestion(dayKey: string): ClarifyQuestion {
  return {
    id: "deadline",
    kind: "deadline",
    prompt: "最晚什么时候要交？",
    options: [
      { id: "todayEod", label: "今天 23:59", hint: dayKey },
      { id: "tomorrowEod", label: "明天 23:59", hint: addDaysToKey(dayKey, 1) },
    ],
    freeInputPlaceholder: "也可以直接说：10月31日",
  };
}

/* ─────────────────────────── 答案 → patch ─────────────────────────── */

/**
 * 把一次回答翻译成字段 patch，**纯函数**。
 * 自由输入认不出来返回 `null` —— 调用方提示"这句没听懂，换个说法"，
 * 绝不猜一个日期塞进去：猜错的日程比没有日程更糟。
 */
export function answerToPatch(
  question: ClarifyQuestion,
  answer: ClarifyAnswer,
  draft: TaskDraft,
  dayKey: string,
): Partial<TaskDraft> | null {
  if (answer.source === "skip") return { needsReview: true };

  const optionId = answer.source === "option" ? answer.optionId : null;

  switch (question.kind) {
    case "date": {
      if (optionId === "keep") return { needsReview: true };

      const offset =
        optionId === "today" ? 0 : optionId === "tomorrow" ? 1 : optionId === "dayAfter" ? 2 : null;

      if (offset !== null) {
        const targetDayKey = addDaysToKey(dayKey, offset);
        // 已有开始时刻：只换日期、保留时刻
        if (draft.start !== null) {
          const startMs = Date.parse(draft.start);
          if (!Number.isFinite(startMs)) return null;
          const minutes = Math.round((startMs - msFromDayKey(dayKeyOf(startMs), 0)) / 60_000);
          const newStartMs = msFromDayKey(targetDayKey, Math.max(0, minutes));
          const durationMin = Math.max(draft.durationMin, 15);
          return {
            start: new Date(newStartMs).toISOString(),
            end: new Date(newStartMs + durationMin * 60_000).toISOString(),
            durationMin,
            needsReview: false,
          };
        }
        // 没有时刻：先记成"当天 23:59 截止"，不造一个 00:00 的假时段
        return { ...dayEndDeadline(targetDayKey), needsReview: true };
      }

      if (answer.source === "free") return parseFreeDate(answer.text, dayKey);
      return null;
    }

    case "duration": {
      let minutes: number | null = null;
      if (optionId !== null && optionId.startsWith("m")) {
        minutes = Number.parseInt(optionId.slice(1), 10);
      } else if (answer.source === "free") {
        minutes = parseFreeMinutes(answer.text);
      }
      if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return null;
      const capped = Math.min(minutes, 24 * 60);
      if (draft.start !== null) {
        const startMs = Date.parse(draft.start);
        if (!Number.isFinite(startMs)) return { durationMin: capped };
        return {
          durationMin: capped,
          end: new Date(startMs + capped * 60_000).toISOString(),
          needsReview: false,
        };
      }
      return { durationMin: capped, needsReview: false };
    }

    case "deadline": {
      if (optionId === "todayEod") return { ...dayEndDeadline(dayKey), needsReview: false };
      if (optionId === "tomorrowEod") {
        return { ...dayEndDeadline(addDaysToKey(dayKey, 1)), needsReview: false };
      }
      if (answer.source === "free") return parseFreeDate(answer.text, dayKey);
      return null;
    }
  }
}

function dayEndDeadline(dayKey: string): Partial<TaskDraft> {
  return { deadline: new Date(msFromDayKey(dayKey, 23 * 60 + 59)).toISOString() };
}

/** "10月25日 / 10-25 / 2026-10-25" → 当天 23:59 截止。认不出返回 null */
export function parseFreeDate(text: string, dayKey: string): Partial<TaskDraft> | null {
  const trimmed = text.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  const short = /^(\d{1,2})\s*[月/-]\s*(\d{1,2})\s*[日号]?$/.exec(trimmed);
  const year = Number.parseInt(dayKey.slice(0, 4), 10);

  let month: number | null = null;
  let day: number | null = null;
  if (iso !== null) {
    month = Number.parseInt(iso[2] ?? "", 10);
    day = Number.parseInt(iso[3] ?? "", 10);
  } else if (short !== null) {
    month = Number.parseInt(short[1] ?? "", 10);
    day = Number.parseInt(short[2] ?? "", 10);
  }
  if (month === null || day === null) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  let candidate = new Date(year, month - 1, day, 23, 59, 0, 0);
  if (Number.isNaN(candidate.getTime())) return null;
  // 跨年：算出来已经过去 → 顺延一年（12 月看到「1 月 5 日」应当是明年）
  if (candidate.getTime() < msFromDayKey(dayKey, 0)) {
    candidate = new Date(year + 1, month - 1, day, 23, 59, 0, 0);
  }
  return { deadline: candidate.toISOString(), needsReview: false };
}

/** "45 分钟 / 1.5 小时 / 2h / 45" → 分钟。认不出返回 null */
export function parseFreeMinutes(text: string): number | null {
  const trimmed = text.trim();
  const min = /(\d{1,3})\s*(?:分钟|min|mins)/i.exec(trimmed);
  if (min !== null) return Number.parseInt(min[1] ?? "", 10);
  const hour = /(\d+(?:\.\d+)?)\s*(?:小时|h\b|hr)/i.exec(trimmed);
  if (hour !== null) return Math.round(Number.parseFloat(hour[1] ?? "") * 60);
  const bare = /^(\d{1,3})$/.exec(trimmed);
  if (bare !== null) return Number.parseInt(bare[1] ?? "", 10);
  return null;
}

/* ─────────────────────────── 唯一的合并入口 ─────────────────────────── */

/**
 * 草稿 patch 的**唯一合并函数**。
 * 修正表和追问面板都必须调它 —— 这是 007 里"双写 bug"的防线：
 * 两个入口的合并语义完全一样（浅合并、同名字段后到者覆盖），
 * 不存在"谁先写谁被吞"的实现差异。
 */
export function mergeDraftPatch(draft: TaskDraft, patch: Partial<TaskDraft>): TaskDraft {
  return { ...draft, ...patch };
}

/** 人话回显：这次回答记成一句，供修正表显示「刚补了什么」 */
export function describeClarifyAnswer(
  question: ClarifyQuestion,
  answer: ClarifyAnswer,
): string | null {
  if (answer.source === "skip") return null;
  const value =
    answer.source === "option"
      ? (question.options.find((option) => option.id === answer.optionId)?.label ?? answer.optionId)
      : answer.text.trim();
  if (value.length === 0) return null;
  return `${question.prompt.replace(/？$/, "")}：${value}`;
}

/** 界面上一句人话：这条草稿还差什么 */
export function describeMissing(diagnosis: DraftDiagnosis, dayKey: string): string | null {
  if (!diagnosis.needsAsking) return null;
  const labels: Record<MissingField, string> = {
    date: `没有日期（今天是 ${dayKey} · ${weekdayLabel(dayKey)}）`,
    duration: "没有时长",
    deadline: "没有截止时间",
  };
  return diagnosis.missing.map((field) => labels[field]).join("、");
}

/**
 * `needsReview` 的收敛口径，两个调用方（修正表保存 / 追问结束）共用：
 * 还有缺的字段就保持待确认；补齐了就不主动清 —— 清不清由用户在修正表里点。
 */
export function settleNeedsReview(draft: TaskDraft): TaskDraft {
  const { needsAsking } = diagnoseDraft(draft);
  return { ...draft, needsReview: needsAsking ? true : draft.needsReview };
}
