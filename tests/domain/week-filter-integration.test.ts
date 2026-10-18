import { describe, expect, it } from "vitest";
import { DEFAULT_DETECT_CONFIG, detectConflicts } from "@/domain/conflicts";
import type { Task } from "@/domain/schemas/task";
import { DAY, DEMO_NOW, block } from "./support/tasks";

/**
 * WO-03 回归：`repeat.weeks` 的周次过滤必须**端到端**生效。
 *
 * 背景（2026-10-18 评审当场抓到）：`expandOccurrences` 只在
 * `termStartDayKey` 非空时才筛周次，而 `DEFAULT_DETECT_CONFIG.termStartDayKey`
 * 曾经是 `null` —— 于是"只在单周上"的课在真实调用里被当成每周都上：
 * 单测全绿、功能是死的（假绿）。
 *
 * 这组用例刻意走「默认配置 + detectConflicts」这条真实路径，不直接给
 * `expandOccurrences` 传参，所以它能拦住"默认值又被改回 null"的回退。
 */
describe("周次过滤端到端（默认配置，WO-03 回归）", () => {
  const WEEK7_TUE = "2026-10-20"; // 学期第 7 周（单周）
  const WEEK8_TUE = "2026-10-27"; // 学期第 8 周（双周）

  const oddWeekly = (id: string): Task =>
    block(DAY, 19, 0, 21, 0, {
      id,
      repeat: {
        kind: "weekly",
        byDay: [2], // 周二
        weeks: { from: 1, to: 16, parity: "odd", except: [] },
      },
    });

  const fixedAt = (id: string, dayKey: string): Task => block(dayKey, 19, 0, 21, 0, { id });

  const overlapCount = (tasks: readonly Task[]): number =>
    detectConflicts(tasks, DEFAULT_DETECT_CONFIG, DEMO_NOW).filter(
      (conflict) => conflict.conflictType === "overlap",
    ).length;

  it("默认配置的 termStartDayKey 必须非空（否则周次过滤永远不触发）", () => {
    expect(DEFAULT_DETECT_CONFIG.termStartDayKey).toBeTruthy();
    expect(String(DEFAULT_DETECT_CONFIG.termStartDayKey)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("单周课不落在第 8 周：那里放一条同时段固定课也不该判重叠", () => {
    expect(overlapCount([oddWeekly("odd-class"), fixedAt("fixed-w8", WEEK8_TUE)])).toBe(0);
  });

  it("单周课落在第 7 周：同周同时段固定课必须照常判重叠（证明过滤不是把全都滤掉）", () => {
    expect(overlapCount([oddWeekly("odd-class"), fixedAt("fixed-w7", WEEK7_TUE)])).toBeGreaterThan(0);
  });
});
