import { beforeEach, describe, expect, it } from "vitest";
import { usePlannerStore } from "@/data/store";
import { formatTimetableSummary, planTimetableCoverage, type TimetableBlock } from "@/domain/schedule";
import { MS_MINUTE, msFromDayKey } from "@/domain/time";
import type { Task } from "@/domain/schemas/task";
import { DEMO_DAY_KEY } from "@/shared/constants";

/**
 * WO-02 回归：课表重传覆盖必须真的落到库里。
 *
 * 评审原话（2026-10-18）：`planTimetableCoverage` 只有纯函数与单测，
 * **store 没有 action、UI 没有入口** → "重传不叠加"这个差异点在产品里摸不到。
 *
 * 这里锁三件事：
 * 1. 四数正确（新增 2 / 调走 1 / 删除 0 / 未变 1 —— 用例内自定的小样本）
 * 2. `updated` 走**原地 update**：`done` / `locked` / `needsReview` 一个都不许重置
 * 3. 执行前压快照，`undo()` 能整体退回
 */
describe("applyTimetablePlan（重传覆盖落库）", () => {
  const makeTask = (id: string, title: string, weekday: number, startMinute: number, extra: Partial<Task> = {}): Task => {
    const mondayKey = DEMO_DAY_KEY;
    const dayMs = msFromDayKey(mondayKey, 0) + (weekday - 3) * 24 * 60 * MS_MINUTE; // 10-19 是周一(1)
    const startMs = dayMs + startMinute * MS_MINUTE;
    return {
      id,
      title,
      start: new Date(startMs).toISOString(),
      end: new Date(startMs + 100 * MS_MINUTE).toISOString(),
      durationMin: 100,
      deadline: null,
      priority: 2,
      source: "manual",
      done: false,
      rawTextOrigin: null,
      location: "二教304",
      locked: true,
      flexible: false,
      repeat: null,
      needsReview: false,
      ...extra,
    };
  };

  const beforeBlocks: TimetableBlock[] = [
    { taskId: "t_math", title: "高等数学", weekday: 3, startMinute: 8 * 60, durationMin: 100 },
    { taskId: "t_ds", title: "数据结构", weekday: 4, startMinute: 14 * 60, durationMin: 100 },
  ];
  const afterBlocks: TimetableBlock[] = [
    { title: "高等数学", weekday: 3, startMinute: 8 * 60, durationMin: 100 }, // 未变
    { title: "数据结构", weekday: 4, startMinute: 10 * 60, durationMin: 100 }, // 调走（同时段不同）
    { title: "大学物理", weekday: 5, startMinute: 14 * 60, durationMin: 100 }, // 新增
    { title: "大学英语", weekday: 1, startMinute: 8 * 60, durationMin: 100 }, // 新增
  ];
  const plan = planTimetableCoverage(beforeBlocks, afterBlocks);

  beforeEach(() => {
    usePlannerStore.setState({
      tasks: [
        makeTask("t_math", "高等数学", 3, 8 * 60),
        makeTask("t_ds", "数据结构", 4, 14 * 60, { done: true, needsReview: true }),
      ],
      snapshot: null,
      lastError: null,
    });
  });

  it("计划本身是 新增 2 / 调走 1 / 删除 0", () => {
    expect(plan.summary).toEqual({ added: 2, updated: 1, removed: 0, unchanged: 1, total: 4 });
  });

  it("执行后：任务数 = 原 2 条 + 新增 2 条 = 4，原任务 id 不变、数据合法", () => {
    const result = usePlannerStore.getState().applyTimetablePlan(plan);
    expect(result.ok).toBe(true);
    expect(result.summary).toBe(formatTimetableSummary(plan));

    const tasks = usePlannerStore.getState().tasks;
    expect(tasks).toHaveLength(4);
    expect(tasks.map((task) => task.id)).toContain("t_ds");
    // 数据结构被"调走"到 10:00，但 id 没变（原地 update，不是删了重建）
    const ds = tasks.find((task) => task.id === "t_ds");
    expect(ds?.durationMin).toBe(100);
    expect(new Date(ds!.start!).getHours()).toBeGreaterThanOrEqual(9);
  });

  it("原地 update 不重置用户状态：done / locked / needsReview 全部保留", () => {
    usePlannerStore.getState().applyTimetablePlan(plan);
    const ds = usePlannerStore.getState().tasks.find((task) => task.id === "t_ds");
    expect(ds?.done).toBe(true);
    expect(ds?.locked).toBe(true);
    expect(ds?.needsReview).toBe(true);
  });

  it("执行前压快照，undo 能整体退回", () => {
    const before = usePlannerStore.getState().tasks.map((task) => task.id);
    usePlannerStore.getState().applyTimetablePlan(plan);
    usePlannerStore.getState().undo();
    expect(usePlannerStore.getState().tasks.map((task) => task.id)).toEqual(before);
  });
});
