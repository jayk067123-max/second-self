import {
  answerToPatch,
  buildQuestions,
  type ClarifyAnswer,
  type ClarifyQuestion,
} from "@/domain/clarify";
import type { TaskDraft } from "@/domain/schemas/task";

/**
 * 追问队列 —— 「一屏一问」的**纯逻辑**，与 domain 的 `clarify.ts` 分开两层：
 *   - `domain/clarify.ts`：缺什么、怎么问、答案怎么变成字段 patch（算法）
 *   - 本文件：一次只挑一个问题、跳过的记下来、答不出来就报错（界面编排）
 *
 * 为什么编排也要单独抽出来：它决定"用户到底被问几次"，
 * 写进组件里就只能靠手点验证；写成纯函数可以单测（`tests/ui/clarifyQueue.test.ts`）。
 *
 * 铁律（007 卡）：本层只产出 patch，**不写库**。落库永远由 IntakePanel 调
 * `addDrafts` 这一个 store action 完成。
 */

export interface PendingQuestion {
  /** 该草稿在 `drafts` 里的下标；patch 回写要用它 */
  index: number;
  draft: TaskDraft;
  question: ClarifyQuestion;
}

/** 这一条要不要问（用户已经点过"先跳过"的不再问） */
function questionsOf(draft: TaskDraft, dayKey: string): ClarifyQuestion[] {
  return buildQuestions(draft, dayKey);
}

/** 还有多少条待问（用户看到的"还剩 N 条"） */
export function pendingCount(
  drafts: readonly TaskDraft[],
  dayKey: string,
  skipped: readonly number[],
): number {
  const skip = new Set(skipped);
  return drafts.reduce(
    (sum, draft, index) => (skip.has(index) || questionsOf(draft, dayKey).length === 0 ? sum : sum + 1),
    0,
  );
}

/**
 * 下一屏该问什么（一屏一问）。
 * 返回 null 表示**全部问完了** —— 调用方据此切到修正表，不再弹任何卡。
 */
export function nextQuestion(
  drafts: readonly TaskDraft[],
  dayKey: string,
  skipped: readonly number[],
): PendingQuestion | null {
  const skip = new Set(skipped);
  for (const [index, draft] of drafts.entries()) {
    if (skip.has(index)) continue;
    const [question] = questionsOf(draft, dayKey);
    if (question === undefined) continue;
    return { index, draft, question };
  }
  return null;
}

export type AnswerOutcome =
  /** 正常拿到 patch；`skipDraft` 为 true 表示这条不再追问 */
  | { ok: true; patch: Partial<TaskDraft>; skipDraft: boolean; echo: string }
  /** 自由输入没听懂：什么都不改，让用户重说 */
  | { ok: false; message: string };

/**
 * 把一次回答算成结果。
 * 注意两个"不猜"的分支：
 *   1. `answerToPatch` 返回 null（自由输入认不出）→ 不产生 patch，提示重说；
 *   2. 即使 patch 是空对象（"这题先跳过"），也要把这条记进 skipped，
 *      否则诊断条件没变，下一屏还是同一题，用户会被卡在原地。
 */
export function resolveAnswer(
  pending: PendingQuestion,
  answer: ClarifyAnswer,
  dayKey: string,
): AnswerOutcome {
  const patch = answerToPatch(pending.question, answer, pending.draft, dayKey);
  if (patch === null) {
    return {
      ok: false,
      message:
        pending.question.kind === "duration"
          ? "没听懂这个时长，试试「45 分钟」「1.5 小时」"
          : "没认出这个日期，试试「10月25日」或直接点上面的选项",
    };
  }
  const echo =
    answer.source === "skip"
      ? `${pending.draft.title}：先跳过，留到修正表里改`
      : `${pending.draft.title}：${pending.question.prompt.replace(/？$/, "")} → ${labelOf(pending.question, answer)}`;
  return { ok: true, patch, skipDraft: answer.source === "skip" || (answer.source === "option" && answer.optionId === "keep"), echo };
}

function labelOf(question: ClarifyQuestion, answer: ClarifyAnswer): string {
  if (answer.source === "option") {
    return question.options.find((option) => option.id === answer.optionId)?.label ?? answer.optionId;
  }
  if (answer.source === "free") return answer.text.trim();
  return "跳过";
}
