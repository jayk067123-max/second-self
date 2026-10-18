import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFLICT_OPTIONS,
  dailyTotals,
  describeConflict,
  detectConflicts,
  minutesOnDay,
  timedTasksOf,
  conflictedTaskIds,
} from "@/domain/conflicts";
import { DAY, NEXT_DAY, blockTask, hhmm, makeTask } from "../helpers/fixtures";

describe("timedTasksOf", () => {
  it("过滤掉没有时间块与零时长的任务", () => {
    const noTime = makeTask({ durationMin: 30 });
    const zero = makeTask({ start: hhmm(DAY, 9), end: hhmm(DAY, 9), durationMin: 0 });
    const normal = blockTask(DAY, 10, 0, 11, 0);
    expect(timedTasksOf([noTime, zero, normal])).toHaveLength(1);
  });

  it("忽略非法时间字符串", () => {
    const broken = makeTask({ start: "not-a-date", end: "also-bad", durationMin: 30 });
    expect(timedTasksOf([broken])).toHaveLength(0);
  });
});

describe("detectConflicts · 时间重叠", () => {
  it("完全没有任务时不报冲突", () => {
    expect(detectConflicts([])).toEqual([]);
  });

  it("时间错开足够远的任务不冲突", () => {
    const a = blockTask(DAY, 9, 0, 10, 0);
    const b = blockTask(DAY, 11, 0, 12, 0);
    expect(detectConflicts([a, b])).toEqual([]);
  });

  it("部分重叠时给出重叠分钟数", () => {
    const a = blockTask(DAY, 9, 0, 10, 30);
    const b = blockTask(DAY, 10, 0, 11, 0);
    const conflicts = detectConflicts([a, b]);
    expect(conflicts).toHaveLength(1);
    const first = conflicts[0];
    expect(first?.kind).toBe("overlap");
    if (first?.kind === "overlap") {
      expect(first.minutes).toBe(30);
      expect(first.taskIds).toEqual([a.id, b.id]);
    }
  });

  it("完全包含也算重叠", () => {
    const outer = blockTask(DAY, 9, 0, 12, 0);
    const inner = blockTask(DAY, 10, 0, 10, 45);
    const conflicts = detectConflicts([outer, inner]);
    expect(conflicts.filter((c) => c.kind === "overlap")).toHaveLength(1);
  });

  it("首尾相接不算重叠（半开区间），但算缓冲不足", () => {
    const a = blockTask(DAY, 9, 0, 10, 0);
    const b = blockTask(DAY, 10, 0, 11, 0);
    const conflicts = detectConflicts([a, b]);
    const overlaps = conflicts.filter((c) => c.kind === "overlap");
    const buffers = conflicts.filter((c) => c.kind === "buffer");
    expect(overlaps).toHaveLength(0);
    expect(buffers).toHaveLength(1);
    if (buffers[0]?.kind === "buffer") expect(buffers[0].gapMin).toBe(0);
  });

  it("跨天任务与次日凌晨任务重叠也能识别", () => {
    const overnight = makeTask({
      start: hhmm(DAY, 23, 0),
      end: hhmm(NEXT_DAY, 1, 0),
      durationMin: 120,
    });
    const early = blockTask(NEXT_DAY, 0, 30, 1, 30);
    const conflicts = detectConflicts([overnight, early]);
    expect(conflicts.some((c) => c.kind === "overlap")).toBe(true);
  });
});

describe("detectConflicts · 缓冲不足", () => {
  it("间隔 14 分钟判定为缓冲不足", () => {
    const a = blockTask(DAY, 9, 0, 10, 0);
    const b = blockTask(DAY, 10, 14, 11, 0);
    const buffers = detectConflicts([a, b]).filter((c) => c.kind === "buffer");
    expect(buffers).toHaveLength(1);
    if (buffers[0]?.kind === "buffer") {
      expect(buffers[0].gapMin).toBe(14);
      expect(buffers[0].requiredMin).toBe(DEFAULT_CONFLICT_OPTIONS.bufferMin);
    }
  });

  it("间隔正好 15 分钟视为达标（边界）", () => {
    const a = blockTask(DAY, 9, 0, 10, 0);
    const b = blockTask(DAY, 10, 15, 11, 0);
    expect(detectConflicts([a, b])).toEqual([]);
  });

  it("缓冲阈值可配置：30 分钟要求下 20 分钟间隔仍不合格", () => {
    const a = blockTask(DAY, 9, 0, 10, 0);
    const b = blockTask(DAY, 10, 20, 11, 0);
    const conflicts = detectConflicts([a, b], { bufferMin: 30, dailyLimitMin: 600 });
    expect(conflicts.filter((c) => c.kind === "buffer")).toHaveLength(1);
  });

  it("零时长任务不产生缓冲判定", () => {
    const point = makeTask({ start: hhmm(DAY, 10, 5), end: hhmm(DAY, 10, 5), durationMin: 0 });
    const a = blockTask(DAY, 9, 0, 10, 0);
    expect(detectConflicts([a, point])).toEqual([]);
  });
});

describe("detectConflicts · 单日超载", () => {
  it("累计正好等于上限不报超载", () => {
    const a = blockTask(DAY, 8, 0, 13, 0, { durationMin: 300 });
    const b = blockTask(DAY, 14, 0, 19, 0, { durationMin: 300 });
    expect(detectConflicts([a, b])).toEqual([]);
  });

  it("超过上限报 daily-overload 并给出总量", () => {
    const a = blockTask(DAY, 7, 0, 13, 0, { durationMin: 360 });
    const b = blockTask(DAY, 14, 0, 20, 0, { durationMin: 360 });
    const overloads = detectConflicts([a, b]).filter((c) => c.kind === "daily-overload");
    expect(overloads).toHaveLength(1);
    if (overloads[0]?.kind === "daily-overload") {
      expect(overloads[0].dayKey).toBe(DAY);
      expect(overloads[0].totalMin).toBe(720);
      expect(overloads[0].limitMin).toBe(600);
    }
  });

  it("跨天任务在零点切开、分别计入两天", () => {
    const overnight = makeTask({
      start: hhmm(DAY, 23, 0),
      end: hhmm(NEXT_DAY, 1, 0),
      durationMin: 120,
    });
    const totals = dailyTotals(timedTasksOf([overnight]));
    expect(totals.get(DAY)).toBe(60);
    expect(totals.get(NEXT_DAY)).toBe(60);
    expect(minutesOnDay([overnight], DAY)).toBe(60);
  });
});

describe("冲突排序与人话描述", () => {
  it("返回顺序是 overlap → buffer → overload", () => {
    const a = blockTask(DAY, 7, 0, 13, 0, { durationMin: 360, title: "写实验报告" });
    const b = blockTask(DAY, 12, 0, 18, 0, { durationMin: 360, title: "小组会议" });
    const c = blockTask(DAY, 18, 10, 19, 0, { durationMin: 50, title: "复盘" });
    const kinds = detectConflicts([a, b, c]).map((k) => k.kind);
    const firstOverload = kinds.indexOf("daily-overload");
    expect(kinds.slice(0, 1)).toEqual(["overlap"]);
    if (firstOverload >= 0) expect(kinds.indexOf("buffer")).toBeLessThan(firstOverload);
  });

  it("describeConflict 输出可读中文", () => {
    const a = blockTask(DAY, 9, 0, 10, 30, { title: "高数作业" });
    const b = blockTask(DAY, 10, 0, 11, 0, { title: "英语听力" });
    const [conflict] = detectConflicts([a, b]);
    expect(conflict).toBeDefined();
    expect(describeConflict(conflict!, [a, b])).toBe("「高数作业」与「英语听力」时间重叠 30 分钟");
  });

  it("conflictedTaskIds 汇总涉及的任务", () => {
    const a = blockTask(DAY, 9, 0, 10, 0);
    const b = blockTask(DAY, 9, 30, 10, 30);
    const ids = conflictedTaskIds(detectConflicts([a, b]));
    expect(ids.has(a.id)).toBe(true);
    expect(ids.has(b.id)).toBe(true);
  });
});
