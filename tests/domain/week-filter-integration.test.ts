import { describe, expect, it } from "vitest";
import { DEFAULT_DETECT_CONFIG, detectConflicts } from "@/domain/conflicts";
import type { DetectConfig } from "@/domain/conflicts";
import type { Task } from "@/domain/schemas/task";
import { TERM_START_DAY_KEY } from "@/shared/constants";
import { DAY, DEMO_NOW, block } from "./support/tasks";

/**
 * WO-03 回归：`repeat.weeks` 的周次过滤必须**端到端**生效。
 *
 * 背景（2026-10-18 评审当场抓到）：`expandOccurrences` 只在 `termStartDayKey`
 * 非空时才筛周次。当时 `DEFAULT_DETECT_CONFIG.termStartDayKey` 是 `null`，
 * 而且没有任何一处调用方传它 —— 于是"只在单周上"的课在真实调用里被当成每周都上：
 * 单测全绿、功能是死的（**假绿**）。
 *
 * 现在的口径（2026-10-18 二次定稿）：
 * - domain 的默认值是**中性 null**（domain 不知道用户在哪个学期），
 * - 学期锚点由 **app 层注入**（`src/app/planner/page.tsx` 的 detectConfig 里传
 *   `TERM_START_DAY_KEY`），和 `now` 的注入方式一致；
 * - 所以这组用例刻意走「显式注入 + `detectConflicts`」这条**真实路径**，
 *   而不是直接给 `expandOccurrences` 传参 —— 它能拦住"注入了但没透传"这类回退。
 */
const INJECTED: DetectConfig = { ...DEFAULT_DETECT_CONFIG, termStartDayKey: TERM_START_DAY_KEY };

describe("周次过滤端到端（显式注入学期锚点，WO-03 回归）", () => {
  // TERM_START_DAY_KEY = 2026-09-21（第 1 周周一）→ 10-20 是第 5 周（单），10-27 是第 6 周（双）
  const ODD_WEEK_TUE = "2026-10-20";
  const EVEN_WEEK_TUE = "2026-10-27";

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

  const overlapCount = (tasks: readonly Task[], config: DetectConfig = INJECTED): number =>
    detectConflicts(tasks, config, DEMO_NOW).filter(
      (conflict) => conflict.conflictType === "overlap",
    ).length;

  it("domain 默认是中性的 null（不绑定任何学期常量），学期锚点由 app 注入", () => {
    expect(DEFAULT_DETECT_CONFIG.termStartDayKey).toBeNull();
    expect(TERM_START_DAY_KEY).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("注入锚点后，单周课不落在双周：那里放一条同时段固定课也不该判重叠", () => {
    expect(overlapCount([oddWeekly("odd-class"), fixedAt("fixed-even", EVEN_WEEK_TUE)])).toBe(0);
  });

  it("注入锚点后，单周课落在单周：同周同时段固定课必须照常判重叠（证明过滤不是把全都滤掉）", () => {
    expect(overlapCount([oddWeekly("odd-class"), fixedAt("fixed-odd", ODD_WEEK_TUE)])).toBeGreaterThan(0);
  });

  it("不注入锚点（null）时不过滤 —— 已文档化的行为：宁可多排，不藏课", () => {
    expect(overlapCount([oddWeekly("odd-class"), fixedAt("fixed-even", EVEN_WEEK_TUE)], DEFAULT_DETECT_CONFIG)).toBeGreaterThan(0);
  });
});
