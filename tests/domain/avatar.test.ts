import { describe, expect, it } from "vitest";
import { computeAvatarSummary, tasksOnDay } from "@/domain/avatar";
import { DAY, NEXT_DAY, blockTask, hhmm, makeTask } from "../helpers/fixtures";

describe("tasksOnDay", () => {
  it("按时间块归属当天", () => {
    const task = blockTask(DAY, 9, 0, 10, 0);
    expect(tasksOnDay([task], DAY)).toHaveLength(1);
    expect(tasksOnDay([task], NEXT_DAY)).toHaveLength(0);
  });

  it("只有截止时间的任务也算当天", () => {
    const ddl = makeTask({ title: "交材料", deadline: hhmm(DAY, 23, 0) });
    expect(tasksOnDay([ddl], DAY)).toHaveLength(1);
  });

  it("跨零点的任务在两天都算", () => {
    const overnight = makeTask({
      start: hhmm(DAY, 23, 0),
      end: hhmm(NEXT_DAY, 1, 0),
      durationMin: 120,
    });
    expect(tasksOnDay([overnight], DAY)).toHaveLength(1);
    expect(tasksOnDay([overnight], NEXT_DAY)).toHaveLength(1);
  });
});

describe("computeAvatarSummary · 三态判定", () => {
  it("空的一天是满血，并给出引导文案", () => {
    const summary = computeAvatarSummary([], DAY);
    expect(summary.state).toBe("energized");
    expect(summary.broadcast).toContain("空白页");
    expect(summary.progress).toBe(0);
  });

  it("负载达到上限即超载", () => {
    const tasks = [
      blockTask(DAY, 8, 0, 14, 0, { durationMin: 360 }),
      blockTask(DAY, 15, 0, 20, 0, { durationMin: 300 }),
    ];
    const summary = computeAvatarSummary(tasks, DAY);
    expect(summary.loadMin).toBe(660);
    expect(summary.state).toBe("overloaded");
    expect(summary.broadcast).toContain("超过上限");
  });

  it("负载 70% 以上为疲惫", () => {
    const tasks = [blockTask(DAY, 8, 0, 15, 30, { durationMin: 450 })];
    const summary = computeAvatarSummary(tasks, DAY);
    expect(summary.loadRatio).toBeCloseTo(0.75, 5);
    expect(summary.state).toBe("tired");
  });

  it("待办较多且完成率低时也会疲惫", () => {
    const tasks = [
      blockTask(DAY, 9, 0, 9, 30, { durationMin: 30 }),
      blockTask(DAY, 10, 0, 10, 30, { durationMin: 30 }),
      blockTask(DAY, 11, 0, 11, 30, { durationMin: 30 }),
    ];
    const summary = computeAvatarSummary(tasks, DAY);
    expect(summary.loadRatio).toBeLessThan(0.7);
    expect(summary.state).toBe("tired");
  });

  it("完成度高时恢复满血，进度按完成率计算", () => {
    const tasks = [
      blockTask(DAY, 9, 0, 9, 30, { durationMin: 30, done: true }),
      blockTask(DAY, 10, 0, 10, 30, { durationMin: 30, done: true }),
      blockTask(DAY, 11, 0, 11, 30, { durationMin: 30, done: true }),
      blockTask(DAY, 12, 0, 12, 30, { durationMin: 30, done: false }),
    ];
    const summary = computeAvatarSummary(tasks, DAY);
    expect(summary.completionRate).toBe(0.75);
    expect(summary.progress).toBe(0.75);
    expect(summary.state).toBe("energized");
    expect(summary.doneCount).toBe(3);
    expect(summary.pendingCount).toBe(1);
  });

  it("下一个待办按优先级与截止时间挑选", () => {
    const tasks = [
      makeTask({ title: "弹性整理", priority: 3, durationMin: 0 }),
      makeTask({ title: "紧急且早的", priority: 1, deadline: hhmm(DAY, 12, 0), durationMin: 0 }),
      makeTask({ title: "紧急但晚的", priority: 1, deadline: hhmm(DAY, 20, 0), durationMin: 0 }),
    ];
    const summary = computeAvatarSummary(tasks, DAY);
    expect(summary.nextTaskTitle).toBe("紧急且早的");
  });
});
