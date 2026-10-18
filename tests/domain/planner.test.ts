import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAN_OPTIONS,
  applyPlan,
  buildLocalPlans,
  summarizePlan,
  validatePlan,
  type ReplanPlan,
} from "@/domain/planner";
import { DAY, NEXT_DAY, hhmm, makeTask } from "../helpers/fixtures";
import type { Task } from "@/domain/schemas/task";

function planOf(blocks: Array<{ taskId: string; start: string; end: string }>): ReplanPlan {
  return { id: "p1", title: "测试方案", rationale: "测试用", blocks };
}

describe("validatePlan · 合法方案", () => {
  it("不重叠、在窗口内、时长不缩水的方案通过", () => {
    const a = makeTask({ title: "作业", durationMin: 60 });
    const b = makeTask({ title: "复盘", durationMin: 30 });
    const plan = planOf([
      { taskId: a.id, start: hhmm(DAY, 9, 0), end: hhmm(DAY, 10, 0) },
      { taskId: b.id, start: hhmm(DAY, 10, 30), end: hhmm(DAY, 11, 0) },
    ]);
    const result = validatePlan(plan, [a, b], DAY);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("validatePlan · 非法方案必须被拦下", () => {
  const a = makeTask({ title: "作业", durationMin: 60 });
  const b = makeTask({ title: "复盘", durationMin: 30 });

  it("方案内部重叠", () => {
    const plan = planOf([
      { taskId: a.id, start: hhmm(DAY, 9, 0), end: hhmm(DAY, 10, 0) },
      { taskId: b.id, start: hhmm(DAY, 9, 45), end: hhmm(DAY, 10, 15) },
    ]);
    const result = validatePlan(plan, [a, b], DAY);
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain("方案内部重叠");
  });

  it("越过作息窗口（07:00–23:00）", () => {
    const plan = planOf([{ taskId: a.id, start: hhmm(DAY, 6, 0), end: hhmm(DAY, 7, 0) }]);
    const result = validatePlan(plan, [a], DAY);
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain("超出作息窗口");
  });

  it("把任务压缩到原定时长以下", () => {
    const plan = planOf([{ taskId: a.id, start: hhmm(DAY, 9, 0), end: hhmm(DAY, 9, 30) }]);
    const result = validatePlan(plan, [a], DAY);
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain("被压缩");
  });

  it("排到 deadline 之后", () => {
    const tight = makeTask({ title: "交材料", durationMin: 30, deadline: hhmm(DAY, 9, 0) });
    const plan = planOf([{ taskId: tight.id, start: hhmm(DAY, 10, 0), end: hhmm(DAY, 10, 30) }]);
    const result = validatePlan(plan, [tight], DAY);
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain("截止时间之后");
  });

  it("落地后当日总量超过上限（含未覆盖任务）", () => {
    const planned = makeTask({ title: "计划内", durationMin: 300 });
    const untouched = makeTask({
      title: "计划外",
      start: hhmm(DAY, 14, 0),
      end: hhmm(DAY, 20, 0),
      durationMin: 360,
    });
    const plan = planOf([
      { taskId: planned.id, start: hhmm(DAY, 8, 0), end: hhmm(DAY, 13, 0) },
    ]);
    const result = validatePlan(plan, [planned, untouched], DAY);
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain("超过上限");
  });

  it("不存在的任务 id", () => {
    const plan = planOf([{ taskId: "ghost", start: hhmm(DAY, 9, 0), end: hhmm(DAY, 10, 0) }]);
    const result = validatePlan(plan, [a], DAY);
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain("不存在的任务");
  });

  it("空方案", () => {
    const result = validatePlan(planOf([]), [a], DAY);
    expect(result.ok).toBe(false);
    expect(result.issues.join()).toContain("没有任何时间块");
  });
});

describe("applyPlan", () => {
  it("写回时间块且不修改原数组", () => {
    const a = makeTask({ title: "作业", durationMin: 60 });
    const b = makeTask({ title: "别动我", durationMin: 30 });
    const original = [a, b];
    const plan = planOf([{ taskId: a.id, start: hhmm(DAY, 9, 0), end: hhmm(DAY, 10, 30) }]);
    const next = applyPlan(original, plan);

    expect(original[0]?.start).toBeNull();
    expect(next[0]?.start).toBe(hhmm(DAY, 9, 0));
    expect(next[0]?.durationMin).toBe(90);
    expect(next[1]).toEqual(b);
  });
});

describe("buildLocalPlans · 本地兜底生成器", () => {
  const tasks: Task[] = [
    makeTask({ title: "紧急论文", durationMin: 120, priority: 1, deadline: hhmm(NEXT_DAY, 23, 0) }),
    makeTask({ title: "常规复习", durationMin: 90, priority: 2 }),
    makeTask({ title: "弹性整理", durationMin: 45, priority: 3 }),
    makeTask({ title: "已完成的", durationMin: 60, priority: 1, done: true }),
  ];

  it("没有任何任务时返回空数组", () => {
    expect(buildLocalPlans([], DAY)).toEqual([]);
  });

  it("生成的每一套方案都通过本地校验（性质断言）", () => {
    const plans = buildLocalPlans(tasks, DAY);
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      const result = validatePlan(plan, tasks, DAY, DEFAULT_PLAN_OPTIONS);
      expect(result.issues).toEqual([]);
      expect(result.ok).toBe(true);
    }
  });

  it("完成的任务不会进入方案", () => {
    const plans = buildLocalPlans(tasks, DAY);
    const doneId = tasks.find((t) => t.done)!.id;
    for (const plan of plans) {
      expect(plan.blocks.some((b) => b.taskId === doneId)).toBe(false);
    }
  });

  it("结果确定：同样输入两次生成完全一致", () => {
    expect(buildLocalPlans(tasks, DAY)).toEqual(buildLocalPlans(tasks, DAY));
  });

  it("时间块不越界、不重叠", () => {
    const plans = buildLocalPlans(tasks, DAY);
    for (const plan of plans) {
      const ms = plan.blocks
        .map((b) => ({ s: Date.parse(b.start), e: Date.parse(b.end) }))
        .sort((x, y) => x.s - y.s);
      for (let i = 1; i < ms.length; i += 1) {
        expect(ms[i]!.s).toBeGreaterThanOrEqual(ms[i - 1]!.e);
      }
      expect(ms[0]!.s).toBeGreaterThanOrEqual(Date.parse(hhmm(DAY, 7, 0)));
      expect(ms[ms.length - 1]!.e).toBeLessThanOrEqual(Date.parse(hhmm(DAY, 23, 0)));
    }
  });
});

describe("summarizePlan", () => {
  it("汇总覆盖项数、总时长与结束时间", () => {
    const a = makeTask({ durationMin: 60 });
    const b = makeTask({ durationMin: 30 });
    const summary = summarizePlan(
      planOf([
        { taskId: a.id, start: hhmm(DAY, 9, 0), end: hhmm(DAY, 10, 0) },
        { taskId: b.id, start: hhmm(DAY, 10, 30), end: hhmm(DAY, 11, 0) },
      ]),
    );
    expect(summary.count).toBe(2);
    expect(summary.totalMin).toBe(90);
    expect(summary.lastEnd).toBe("11:00");
  });
});
