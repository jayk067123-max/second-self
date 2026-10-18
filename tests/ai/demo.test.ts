import { describe, expect, it } from "vitest";
import { demoParseTasks, demoReplanPlans } from "@/ai/demo";
import { checkRateLimit, resetRateLimit } from "@/ai/ratelimit";
import { formatIssues } from "@/ai/guarded";
import { TaskDraftSchema } from "@/domain/schemas/task";
import { applyPlan } from "@/domain/reflow";
import { DEFAULT_DETECT_CONFIG, detectConflicts } from "@/domain/conflicts";
import { hhmm } from "../domain/support/tasks";
import { makeTask } from "../helpers/fixtures";
import { z } from "zod";

const DAY = "2026-10-18";

describe("demoParseTasks（无密钥兜底解析）", () => {
  it("每条产出都符合 Draft 契约", () => {
    const text = [
      "9:00-10:30 高等数学作业 紧急",
      "14:00 小组会议 90分钟",
      "10月20日 前交实验报告",
      "有空再整理笔记",
    ].join("\n");
    const drafts = demoParseTasks(text, DAY);
    expect(drafts.length).toBeGreaterThanOrEqual(4);
    for (const draft of drafts) {
      expect(TaskDraftSchema.safeParse(draft).success).toBe(true);
    }
  });

  it("解析出时段与时长", () => {
    const [draft] = demoParseTasks("9:00-10:30 高等数学作业", DAY);
    expect(draft?.title).toContain("高等数学作业");
    expect(draft?.durationMin).toBe(90);
    expect(draft?.start).not.toBeNull();
  });

  it("识别紧急与弹性优先级", () => {
    const urgent = demoParseTasks("紧急：交周报", DAY)[0];
    const flex = demoParseTasks("有空整理笔记", DAY)[0];
    expect(urgent?.priority).toBe(1);
    expect(flex?.priority).toBe(3);
  });

  it("只有截止时间的任务没有时间块但带 deadline", () => {
    const [draft] = demoParseTasks("10月20日 前交实验报告", DAY);
    expect(draft?.start).toBeNull();
    expect(draft?.deadline).not.toBeNull();
  });

  it("空文本返回空数组（由上层转成可读错误）", () => {
    expect(demoParseTasks("   \n  ", DAY)).toEqual([]);
  });

  it("结果确定：同一输入两次一致", () => {
    const text = "9:00-10:30 高等数学作业";
    expect(demoParseTasks(text, DAY)).toEqual(demoParseTasks(text, DAY));
  });
});

describe("demoReplanPlans（无密钥兜底重排）", () => {
  it("兜底方案来自裁决器：条目不空、且每套都让冲突数下降（效果闸）", () => {
    const tasks = [
      makeTask({
        title: "论文",
        durationMin: 90,
        priority: 1,
        start: hhmm(DAY, 9, 0),
        end: hhmm(DAY, 10, 0),
      }),
      makeTask({
        title: "复习",
        durationMin: 60,
        priority: 2,
        start: hhmm(DAY, 9, 30),
        end: hhmm(DAY, 10, 30),
      }),
    ];
    const now = new Date(`${DAY}T09:00:00`);
    const before = detectConflicts(tasks, DEFAULT_DETECT_CONFIG, now).length;
    expect(before).toBeGreaterThan(0); // 场景本身有冲突，否则测不到效果闸

    const plans = demoReplanPlans(tasks, DAY);
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      const after = detectConflicts(applyPlan(tasks, plan), DEFAULT_DETECT_CONFIG, now).length;
      expect(after).toBeLessThan(before);
    }
  });

  it("没有冲突时兜底不硬造方案", () => {
    expect(
      demoReplanPlans(
        [makeTask({ title: "唯一一条", durationMin: 60, start: hhmm(DAY, 9, 0), end: hhmm(DAY, 10, 0) })],
        DAY,
      ),
    ).toEqual([]);
  });
});

describe("checkRateLimit", () => {
  it("超过阈值后拒绝并给出等待秒数", () => {
    resetRateLimit();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i += 1) {
      expect(checkRateLimit("k", 3, 60_000, t0).allowed).toBe(true);
    }
    const blocked = checkRateLimit("k", 3, 60_000, t0 + 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("时间窗口过去后恢复", () => {
    resetRateLimit();
    const t0 = 2_000_000;
    checkRateLimit("k2", 1, 60_000, t0);
    expect(checkRateLimit("k2", 1, 60_000, t0 + 1).allowed).toBe(false);
    expect(checkRateLimit("k2", 1, 60_000, t0 + 60_001).allowed).toBe(true);
  });
});

describe("formatIssues", () => {
  it("把 zod 错误压成字段: 原因", () => {
    const schema = z.object({ title: z.string().min(3) });
    const parsed = schema.safeParse({ title: "a" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issues = formatIssues(parsed.error);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain("title");
    }
  });
});
