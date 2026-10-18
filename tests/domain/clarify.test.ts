import { describe, expect, it } from "vitest";
import {
  answerToPatch,
  buildQuestions,
  describeClarifyAnswer,
  diagnoseDraft,
  mergeDraftPatch,
  parseFreeDate,
  parseFreeMinutes,
  settleNeedsReview,
} from "@/domain/clarify";
import { msFromDayKey } from "@/domain/time";
import type { TaskDraft } from "@/domain/schemas/task";

/**
 * 缺信息追问的边界。赌两件事：
 *   1. 不该问的绝不问（只有截止的 DDL 任务是合法的，不许逼用户编一个时段）
 *   2. 认不出的自由输入绝不猜（返回 null，让人重说）
 */

const DAY = "2026-10-19";

function draft(extra: Partial<TaskDraft> = {}): TaskDraft {
  return {
    title: "交数据结构作业",
    start: null,
    end: null,
    durationMin: 0,
    deadline: null,
    priority: 2,
    rawTextOrigin: "1. 数据结构作业下周交",
    needsReview: true,
    repeat: null,
    ...extra,
  };
}

const withStart: Partial<TaskDraft> = {
  start: new Date(msFromDayKey(DAY, 9 * 60)).toISOString(),
  end: new Date(msFromDayKey(DAY, 10 * 60)).toISOString(),
  durationMin: 60,
  needsReview: false,
};

describe("diagnoseDraft", () => {
  it("既没时段也没截止：缺日期", () => {
    const diagnosis = diagnoseDraft(draft());
    expect(diagnosis.missing).toEqual(["date"]);
    expect(diagnosis.noDate).toBe(true);
    expect(diagnosis.needsAsking).toBe(true);
  });

  it("有时段但时长为 0：缺时长", () => {
    const diagnosis = diagnoseDraft(draft({ ...withStart, durationMin: 0, end: null }));
    expect(diagnosis.missing).toEqual(["duration"]);
    expect(diagnosis.noDate).toBe(false);
  });

  it("只有截止时间：是合法的 DDL 任务，不问任何问题", () => {
    const diagnosis = diagnoseDraft(
      draft({ deadline: new Date(msFromDayKey(DAY, 23 * 60 + 59)).toISOString() }),
    );
    expect(diagnosis.missing).toEqual([]);
    expect(diagnosis.needsAsking).toBe(false);
  });

  it("信息齐全：不问", () => {
    expect(diagnoseDraft(draft(withStart)).needsAsking).toBe(false);
  });
});

describe("buildQuestions", () => {
  it("缺日期时只问一个问题（一屏一问，不是一问到底）", () => {
    const questions = buildQuestions(draft(), DAY);
    expect(questions).toHaveLength(1);
    expect(questions[0]?.kind).toBe("date");
    expect(questions[0]?.prompt).toBe("这件事是哪天的？");
  });

  it("选项永远带「先不指定」，让人能退出而不是被迫回答", () => {
    const questions = buildQuestions(draft(), DAY);
    expect(questions[0]?.options.map((option) => option.id)).toContain("keep");
  });

  it("信息齐全时没有任何问句", () => {
    expect(buildQuestions(draft(withStart), DAY)).toEqual([]);
  });
});

describe("answerToPatch · 日期", () => {
  const [dateQ] = buildQuestions(draft(), DAY);

  it("选「明天」且没有时刻：记截止到明天 23:59，不造一个 00:00 的假时段", () => {
    const patch = answerToPatch(dateQ!, { source: "option", optionId: "tomorrow" }, draft(), DAY);
    expect(patch?.start).toBeUndefined();
    const deadline = patch?.deadline;
    expect(deadline).toBeDefined();
    expect(deadline?.slice(0, 10)).toBe("2026-10-20");
    expect(patch?.needsReview).toBe(true);
  });

  it("已有时刻时只换日期、保留时刻", () => {
    const patch = answerToPatch(
      dateQ!,
      { source: "option", optionId: "tomorrow" },
      draft(withStart),
      DAY,
    );
    const start = new Date(patch?.start ?? "");
    expect(start.getMinutes() + start.getHours() * 60).toBe(9 * 60);
    expect(patch?.start?.slice(0, 10)).toBe("2026-10-20");
    expect(patch?.needsReview).toBe(false);
  });

  it("「先不指定」：什么都不改，只保留待确认", () => {
    expect(answerToPatch(dateQ!, { source: "option", optionId: "keep" }, draft(), DAY)).toEqual({
      needsReview: true,
    });
  });

  it("自由输入认不出：返回 null，不猜", () => {
    expect(answerToPatch(dateQ!, { source: "free", text: "回头再说" }, draft(), DAY)).toBeNull();
  });
});

describe("answerToPatch · 时长", () => {
  const durationQ = buildQuestions(draft({ ...withStart, durationMin: 0, end: null }), DAY)[0];

  it("选 1 小时：结束时间跟着算", () => {
    const patch = answerToPatch(durationQ!, { source: "option", optionId: "m60" }, draft(withStart), DAY);
    expect(patch?.durationMin).toBe(60);
    expect(new Date(patch?.end ?? "").getTime()).toBe(
      new Date(withStart.start ?? "").getTime() + 60 * 60_000,
    );
  });

  it("自由输入「45 分钟」", () => {
    const patch = answerToPatch(durationQ!, { source: "free", text: "45 分钟" }, draft(withStart), DAY);
    expect(patch?.durationMin).toBe(45);
  });
});

describe("跳过与合并", () => {
  it("跳过：不改字段，只留待确认", () => {
    const [dateQ] = buildQuestions(draft(), DAY);
    expect(answerToPatch(dateQ!, { source: "skip" }, draft(), DAY)).toEqual({ needsReview: true });
  });

  it("mergeDraftPatch 是唯一合并入口：同名字段后到者覆盖（双写不会互相吞）", () => {
    const merged = mergeDraftPatch(mergeDraftPatch(draft(), { durationMin: 30 }), { durationMin: 60 });
    expect(merged.durationMin).toBe(60);
    // 不是整条替换：没被提到的字段必须留着
    expect(merged.title).toBe("交数据结构作业");
  });

  it("settleNeedsReview：还有缺的字段就保持待确认", () => {
    expect(settleNeedsReview(draft()).needsReview).toBe(true);
    // 补齐后不主动清（清不清由用户在修正表里点）
    expect(settleNeedsReview(draft(withStart)).needsReview).toBe(false);
  });

  it("describeClarifyAnswer 回显一句人话", () => {
    const [dateQ] = buildQuestions(draft(), DAY);
    expect(describeClarifyAnswer(dateQ!, { source: "option", optionId: "tomorrow" })).toBe(
      "这件事是哪天的：明天",
    );
  });
});

describe("自由输入解析", () => {
  it("「10月25日」→ 当天 23:59", () => {
    const patch = parseFreeDate("10月25日", DAY);
    expect(patch?.deadline?.slice(0, 10)).toBe("2026-10-25");
  });

  it("跨年保护：「1月5日」在 10 月看到应是明年", () => {
    const patch = parseFreeDate("1月5日", DAY);
    expect(patch?.deadline?.slice(0, 4)).toBe("2027");
  });

  it("非法月份/日期不猜", () => {
    expect(parseFreeDate("13月1日", DAY)).toBeNull();
    expect(parseFreeDate("下周", DAY)).toBeNull();
  });

  it("时长：分钟 / 小时 / 纯数字", () => {
    expect(parseFreeMinutes("45 分钟")).toBe(45);
    expect(parseFreeMinutes("1.5 小时")).toBe(90);
    expect(parseFreeMinutes("2h")).toBe(120);
    expect(parseFreeMinutes("30")).toBe(30);
    expect(parseFreeMinutes("一会儿")).toBeNull();
  });

  it("纯函数：同一输入两次结果相同", () => {
    expect(parseFreeDate("10月25日", DAY)).toEqual(parseFreeDate("10月25日", DAY));
  });
});
