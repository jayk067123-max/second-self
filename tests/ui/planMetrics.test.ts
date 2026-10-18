import { describe, expect, it } from "vitest";
import { computePlanMetrics } from "@/ui/composites/planMetrics";
import { block, DAY, DEMO_NOW, hhmm } from "../domain/support/tasks";
import type { ReplanPlan } from "@/domain/reflow";

/**
 * 方案卡 4 个数字的单元测试（SPEC · 重排方案卡固定指标）。
 * 这些数字直接决定用户"选哪套"，算错比不显示更糟，所以单独测。
 */
function planOf(blocks: ReplanPlan["blocks"]): ReplanPlan {
  return { id: "p1", title: "测试方案", rationale: "测试", blocks };
}

describe("computePlanMetrics", () => {
  it("没挪动的任务不计入挪动数与偏离", () => {
    const task = block(DAY, 9, 0, 10, 0);
    const plan = planOf([{ taskId: task.id, start: task.start!, end: task.end! }]);
    const metrics = computePlanMetrics(plan, [task], DEMO_NOW);
    expect(metrics.movedCount).toBe(0);
    expect(metrics.deviationMin).toBe(0);
  });

  it("挪动一条并算出偏离分钟数", () => {
    const task = block(DAY, 9, 0, 10, 0);
    const plan = planOf([{ taskId: task.id, start: hhmm(DAY, 11, 0), end: hhmm(DAY, 12, 0) }]);
    const metrics = computePlanMetrics(plan, [task], DEMO_NOW);
    expect(metrics.movedCount).toBe(1);
    expect(metrics.deviationMin).toBe(120);
  });

  it("原本没排时段的任务算新排入，不算偏离", () => {
    const ddlOnly = block(DAY, 9, 0, 9, 0);
    const task = { ...ddlOnly, start: null, end: null, durationMin: 60, deadline: hhmm(DAY, 23, 0) };
    const plan = planOf([{ taskId: task.id, start: hhmm(DAY, 9, 0), end: hhmm(DAY, 10, 0) }]);
    const metrics = computePlanMetrics(plan, [task], DEMO_NOW);
    expect(metrics.movedCount).toBe(1);
    expect(metrics.deviationMin).toBe(0);
  });

  it("动了固定课要单独报出来（方案作废依据）", () => {
    const locked = block(DAY, 9, 0, 10, 0, { locked: true, title: "线性代数" });
    const plan = planOf([{ taskId: locked.id, start: hhmm(DAY, 13, 0), end: hhmm(DAY, 14, 0) }]);
    const metrics = computePlanMetrics(plan, [locked], DEMO_NOW);
    expect(metrics.movedLockedTitles).toEqual(["线性代数"]);
  });

  it("真算冲突前后数量：把重叠的任务挪开后冲突减少", () => {
    const a = block(DAY, 9, 0, 10, 30);
    const b = block(DAY, 10, 0, 11, 0);
    const before = computePlanMetrics(planOf([]), [a, b], DEMO_NOW);
    expect(before.conflictsBefore).toBeGreaterThan(0);

    const plan = planOf([
      { taskId: b.id, start: hhmm(DAY, 14, 0), end: hhmm(DAY, 15, 0) },
    ]);
    const after = computePlanMetrics(plan, [a, b], DEMO_NOW);
    expect(after.conflictsAfter).toBeLessThan(after.conflictsBefore);
  });
});
