import { describe, expect, it } from "vitest";
import { planChanges, timeRangeLabel } from "@/ui/composites/planChanges";
import type { ReplanPlan } from "@/domain/reflow";
import { makeTask, hhmm } from "../helpers/fixtures";

const plan = (blocks: ReplanPlan["blocks"]): ReplanPlan => ({ id: "test", title: "调整方案", rationale: "测试", blocks });

describe("重排前后对照", () => {
  it("只显示实际变动，保留完整标题和原始时间", () => {
    const task = makeTask({ id: "a", title: "一个不应被截断的完整任务名称", start: hhmm("2026-10-28", 14), end: hhmm("2026-10-28", 15) });
    const unchanged = makeTask({ id: "b" });
    const changes = planChanges(plan([
      { taskId: task.id, start: hhmm("2026-10-28", 16), end: hhmm("2026-10-28", 17) },
      { taskId: unchanged.id, start: unchanged.start!, end: unchanged.end! },
    ]), [task, unchanged]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ title: task.title, beforeStart: task.start, beforeEnd: task.end, missing: false });
    expect(task.start).toBe(hhmm("2026-10-28", 14));
  });
  it("等价ISO时区写法不制造虚假变动", () => {
    const task = makeTask({ start: "2026-10-28T14:00:00+08:00", end: "2026-10-28T15:00:00+08:00" });
    expect(planChanges(plan([{ taskId: task.id, start: "2026-10-28T06:00:00Z", end: "2026-10-28T07:00:00Z" }]), [task])).toEqual([]);
  });
  it("原未排任务有明确空状态，缺失任务可被禁止采用", () => {
    const block = { taskId: "missing", start: hhmm("2026-10-28", 14), end: hhmm("2026-10-28", 15) };
    expect(planChanges(plan([block]), [])[0]).toMatchObject({ missing: true, beforeStart: null });
    expect(timeRangeLabel(null, null)).toBe("尚未安排");
  });
  it("同日保留年份日期及完整起止时间", () => {
    expect(timeRangeLabel(hhmm("2026-10-28", 14), hhmm("2026-10-28", 15))).toBe("2026/10/28 14:00–15:00");
  });
  it("跨日保留两端日期，避免次日安排含糊", () => {
    expect(timeRangeLabel(hhmm("2026-10-28", 23), hhmm("2026-10-29", 1))).toBe("2026/10/28 23:00–2026/10/29 01:00");
  });
});
