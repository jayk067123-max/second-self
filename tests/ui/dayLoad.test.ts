import { describe, expect, it } from "vitest";
import { computeAvatarSummary } from "@/domain/avatar";
import { DEFAULT_CONFLICT_OPTIONS, minutesOnDay } from "@/domain/conflicts";
import { buildRowLoads, toDayLoad } from "@/ui/composites/dayLoad";
import { DAY, NEXT_DAY, block, ddl, overnight, todo } from "../domain/support/tasks";

/**
 * 时间轴负载占比的单元测试。
 *
 * 这组用例存在的唯一理由：**行级数字必须和分身卡是同一口径**。
 * 如果哪天有人图省事，把某一行改成 `task.durationMin / 上限`，"跨天任务"那条会立刻红——
 * 那正是「分身说超载、时间轴说没事」的起点，必须在单测里被拦住，而不是等评委看出来。
 */
describe("buildRowLoads", () => {
  it("逐行相加恰好等于分身卡的当天占用（含跨天 / 纯 DDL / 未排时段三种任务）", () => {
    const tasks = [
      block(DAY, 9, 0, 10, 30), // 90
      block(DAY, 14, 0, 15, 0), // 60
      overnight(DAY, 22, 0, NEXT_DAY, 1, 0), // 当天 120、次日 60
      ddl(`${NEXT_DAY}T23:00:00+08:00`), // 无时间块
      todo(45), // 只有时长，没排进时间轴
    ];
    const avatar = computeAvatarSummary(tasks, DAY);
    const rows = buildRowLoads(tasks, DAY, avatar.limitMin);

    const sum = rows.reduce((acc, row) => acc + row.minutes, 0);
    expect(sum).toBe(avatar.loadMin);
    expect(sum).toBe(minutesOnDay(tasks, DAY));
    expect(sum).toBe(270);
  });

  it("跨天任务只算当天那一段（22:00–01:00 当天 120、次日 60）", () => {
    const task = overnight(DAY, 22, 0, NEXT_DAY, 1, 0);
    expect(buildRowLoads([task], DAY, 480)[0]?.minutes).toBe(120);
    expect(buildRowLoads([task], NEXT_DAY, 480)[0]?.minutes).toBe(60);
    // 任务自己的 durationMin 是 180，行级刻意不用它——用了就会和分身对不上
    expect(task.durationMin).toBe(180);
  });

  it("最后一行的累计百分比等于表头百分比（不会出现两个数打架）", () => {
    const tasks = [block(DAY, 8, 0, 9, 40), block(DAY, 10, 0, 11, 30), block(DAY, 15, 0, 16, 0)];
    const avatar = computeAvatarSummary(tasks, DAY);
    const load = toDayLoad(avatar);
    const rows = buildRowLoads(tasks, DAY, load.limitMin);
    expect(rows.at(-1)?.cumulativePercent).toBe(load.percent);
    expect(rows.at(-1)?.cumulativeMin).toBe(avatar.loadMin);
  });

  it("只把「越过上限」的那一行标出来（阈值只有一个：分身算出的 limitMin）", () => {
    const tasks = [block(DAY, 9, 0, 12, 0), block(DAY, 13, 0, 16, 0), block(DAY, 17, 0, 18, 0)];
    const rows = buildRowLoads(tasks, DAY, 240);
    expect(rows.map((row) => row.crossesLimit)).toEqual([false, true, false]);
    expect(rows.map((row) => row.cumulativeMin)).toEqual([180, 360, 420]);
  });

  it("日上限为 0 时不除零、不标超限（与 avatar 的 ratio=0 处理一致）", () => {
    const rows = buildRowLoads([block(DAY, 9, 0, 10, 0)], DAY, 0);
    expect(rows[0]?.cumulativePercent).toBe(0);
    expect(rows[0]?.crossesLimit).toBe(false);
  });

  it("未排时段的任务不占负载，也不显示累计（界面留空而不是显示 0%）", () => {
    const rows = buildRowLoads([ddl(`${NEXT_DAY}T23:00:00+08:00`)], DAY, 480);
    expect(rows[0]?.minutes).toBe(0);
    expect(rows[0]?.cumulativePercent).toBe(0);
  });
});

describe("toDayLoad", () => {
  it("表头一句话里同时有已排、上限与真实百分比", () => {
    const tasks = [block(DAY, 8, 0, 12, 0)];
    const load = toDayLoad(computeAvatarSummary(tasks, DAY));
    expect(load.loadMin).toBe(240);
    expect(load.limitMin).toBe(600);
    expect(load.label).toBe("已排 4 小时 / 上限 10 小时 · 40%");
  });

  it("超载时百分比照实说（超过 100 不截断，截断留给进度条宽度）", () => {
    const tasks = [block(DAY, 8, 0, 12, 0)];
    const avatar = computeAvatarSummary(tasks, DAY, {
      ...DEFAULT_CONFLICT_OPTIONS,
      dailyLimitMin: 120,
    });
    const load = toDayLoad(avatar);
    expect(load.state).toBe("overloaded");
    expect(load.percent).toBe(200);
  });
});
