import { describe, expect, it } from "vitest";
import { nextQuestion, pendingCount, resolveAnswer } from "@/ui/composites/clarifyQueue";
import { mergeDraftPatch } from "@/domain/clarify";
import type { TaskDraft } from "@/domain/schemas/task";

/**
 * 「一屏一问」的编排逻辑：问几次、跳过之后还会不会再问、答不上来怎么办。
 * 这几条决定用户会不会被追问卡住，必须可测，不能靠手点。
 */

const DAY = "2026-10-19";

function draft(title: string, extra: Partial<TaskDraft> = {}): TaskDraft {
  return {
    title,
    start: null,
    end: null,
    durationMin: 0,
    deadline: null,
    priority: 2,
    rawTextOrigin: title,
    needsReview: true,
    repeat: null,
    ...extra,
  };
}

/** 信息齐全的草稿：有时段有截止，不该被问 */
const complete = draft("高数课", {
  start: "2026-10-19T01:00:00.000Z",
  end: "2026-10-19T02:00:00.000Z",
  durationMin: 60,
  deadline: "2026-10-20T15:59:00.000Z",
});

describe("nextQuestion", () => {
  it("信息齐全的草稿一条都不问", () => {
    expect(nextQuestion([complete], DAY, [])).toBeNull();
    expect(pendingCount([complete], DAY, [])).toBe(0);
  });

  it("多条缺信息时只返回第一屏一个问题（不是一次问到底）", () => {
    const drafts = [complete, draft("交作业"), draft("体测")];
    const pending = nextQuestion(drafts, DAY, []);
    expect(pending?.index).toBe(1);
    expect(pending?.draft.title).toBe("交作业");
    expect(pending?.question.kind).toBe("date");
    expect(pendingCount(drafts, DAY, [])).toBe(2);
  });

  it("已跳过的下标不再问", () => {
    const drafts = [draft("交作业"), draft("体测")];
    expect(nextQuestion(drafts, DAY, [0])?.draft.title).toBe("体测");
    expect(nextQuestion(drafts, DAY, [0, 1])).toBeNull();
  });
});

describe("resolveAnswer", () => {
  it("先不指定会继续下一条，同时保留待确认状态", () => {
    const pending = nextQuestion([draft("交作业"), draft("体测")], DAY, [])!;
    const outcome = resolveAnswer(pending, { source: "option", optionId: "keep" }, DAY);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.skipDraft).toBe(true);
    expect(outcome.patch.needsReview).toBe(true);
    expect(outcome.patch.deadline).toBeUndefined();
    expect(nextQuestion([mergeDraftPatch(pending.draft, outcome.patch), draft("体测")], DAY, [0])?.index).toBe(1);
  });

  it("点选日期 → 产出 patch，且这条不再追问（诊断条件变了）", () => {
    const drafts = [draft("交作业")];
    const pending = nextQuestion(drafts, DAY, [])!;
    const outcome = resolveAnswer(pending, { source: "option", optionId: "tomorrow" }, DAY);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.patch.deadline?.slice(0, 10)).toBe("2026-10-20");

    const patched = mergeDraftPatch(pending.draft, outcome.patch);
    expect(nextQuestion([patched], DAY, [])).toBeNull();
  });

  it("自由输入认不出 → 不改数据，给一句人话让用户重说", () => {
    const pending = nextQuestion([draft("交作业")], DAY, [])!;
    const outcome = resolveAnswer(pending, { source: "free", text: "回头再说" }, DAY);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.message).toContain("10月25日");
  });

  it("「先跳过」→ 记进 skipped，保证同一题不会反复弹", () => {
    const pending = nextQuestion([draft("交作业")], DAY, [])!;
    const outcome = resolveAnswer(pending, { source: "skip" }, DAY);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.skipDraft).toBe(true);
    expect(outcome.echo).toContain("先跳过");
  });

  it("时长问句：点「1 小时」后结束时间跟着算，并且不再追问", () => {
    const withStart = draft("写实验报告", {
      start: "2026-10-19T01:00:00.000Z",
      end: null,
      durationMin: 0,
    });
    const pending = nextQuestion([withStart], DAY, [])!;
    expect(pending.question.kind).toBe("duration");
    const outcome = resolveAnswer(pending, { source: "option", optionId: "m60" }, DAY);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const patched = mergeDraftPatch(pending.draft, outcome.patch);
    expect(patched.durationMin).toBe(60);
    expect(nextQuestion([patched], DAY, [])).toBeNull();
  });

  it("纯函数：同一问同一答两次结果一致", () => {
    const pending = nextQuestion([draft("交作业")], DAY, [])!;
    expect(resolveAnswer(pending, { source: "option", optionId: "today" }, DAY)).toEqual(
      resolveAnswer(pending, { source: "option", optionId: "today" }, DAY),
    );
  });
});
