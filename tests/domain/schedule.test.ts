import { describe, expect, it } from "vitest";
import {
  dayInWeekSpec,
  dayKeyOfTermWeek,
  formatTimetableSummary,
  formatWeekSpec,
  isWeekActive,
  normalizeCourseTitle,
  planTimetableCoverage,
  termWeekOf,
  weekdayFromLabel,
  weeksInSpec,
  type TimetableBlock,
  type WeekSpec,
} from "@/domain/schedule";

/**
 * 周次范围 + 课表重传覆盖的边界条件。
 * 这一层的价值全在"可判定的确定性"：同样的输入，摘要数字必须永远一样，
 * 否则演示视频里「新增 2 节、调走 1 节」和评委自己跑出来的对不上。
 */

const TERM_START = "2026-09-07"; // 第 1 周周一
const ALL_WEEKS: WeekSpec = { from: 1, to: 16, parity: "all", except: [] };

function block(
  title: string,
  weekday: number,
  startMinute: number,
  extra: Partial<TimetableBlock> = {},
): TimetableBlock {
  return { title, weekday, startMinute, durationMin: 100, location: null, ...extra };
}

describe("weeksInSpec", () => {
  it("第 1-16 周：连续 16 周", () => {
    expect(weeksInSpec(ALL_WEEKS)).toHaveLength(16);
    expect(weeksInSpec(ALL_WEEKS)[0]).toBe(1);
    expect(weeksInSpec(ALL_WEEKS)[15]).toBe(16);
  });

  it("单周只上奇数周，双周只上偶数周", () => {
    const odd = weeksInSpec({ ...ALL_WEEKS, parity: "odd" });
    const even = weeksInSpec({ ...ALL_WEEKS, parity: "even" });
    expect(odd.slice(0, 3)).toEqual([1, 3, 5]);
    expect(even.slice(0, 3)).toEqual([2, 4, 6]);
    expect(odd.length + even.length).toBe(16);
  });

  it("排除周被剔除（调休/停课）", () => {
    const weeks = weeksInSpec({ ...ALL_WEEKS, except: [8, 9] });
    expect(weeks).toHaveLength(14);
    expect(weeks).not.toContain(8);
    expect(weeks).not.toContain(9);
  });

  it("范围反了没有周次，不抛错", () => {
    expect(weeksInSpec({ from: 8, to: 3, parity: "all", except: [] })).toEqual([]);
  });

  it("超出学期上限的周被截断（防御脏数据）", () => {
    expect(weeksInSpec({ from: 1, to: 99, parity: "all", except: [] })).toHaveLength(30);
  });
});

describe("isWeekActive", () => {
  it("范围内 + 未被排除 + 奇偶匹配才算上", () => {
    const spec: WeekSpec = { from: 3, to: 9, parity: "odd", except: [5] };
    expect(isWeekActive(3, spec)).toBe(true);
    expect(isWeekActive(5, spec)).toBe(false); // 被排除
    expect(isWeekActive(7, spec)).toBe(true);
    expect(isWeekActive(4, spec)).toBe(false); // 偶数周
    expect(isWeekActive(11, spec)).toBe(false); // 超范围
    expect(isWeekActive(2, spec)).toBe(false); // 超范围
  });
});

describe("formatWeekSpec", () => {
  it("单双周与排除周都说清楚", () => {
    expect(formatWeekSpec(ALL_WEEKS)).toBe("第1-16周");
    expect(formatWeekSpec({ ...ALL_WEEKS, parity: "odd" })).toBe("第1-16周·单周");
    expect(formatWeekSpec({ ...ALL_WEEKS, except: [8] })).toBe("第1-16周（跳过第 8 周）");
  });
});

describe("termWeekOf / dayInWeekSpec", () => {
  it("学期第 1 周周一 = 第 1 周", () => {
    expect(termWeekOf(TERM_START, TERM_START)).toBe(1);
    expect(termWeekOf("2026-09-13", TERM_START)).toBe(1); // 第 1 周周日
    expect(termWeekOf("2026-09-14", TERM_START)).toBe(2); // 第 2 周周一
  });

  it("开学前是 0 或负数，不假装在第 1 周", () => {
    expect(termWeekOf("2026-09-01", TERM_START)).toBeLessThan(1);
  });

  it("dayKeyOfTermWeek 与 termWeekOf 互为逆运算", () => {
    for (const week of [1, 2, 8, 16]) {
      expect(termWeekOf(dayKeyOfTermWeek(TERM_START, week), TERM_START)).toBe(week);
    }
  });

  it("按周次范围判定某天是否上课", () => {
    // 第 2 周周三 = 2026-09-16
    expect(dayInWeekSpec("2026-09-16", TERM_START, ALL_WEEKS)).toBe(true);
    expect(dayInWeekSpec("2026-09-16", TERM_START, { ...ALL_WEEKS, parity: "odd" })).toBe(false);
  });
});

describe("planTimetableCoverage", () => {
  it("完全一样：全部 unchanged，摘要全是 0，不提示破坏性变更", () => {
    const timetable = [block("高等数学", 3, 8 * 60), block("数据结构", 4, 10 * 60)];
    const plan = planTimetableCoverage(timetable, timetable);
    expect(plan.summary).toEqual({ added: 0, updated: 0, removed: 0, unchanged: 2, total: 2 });
    expect(plan.hasDestructiveChange).toBe(false);
    expect(formatTimetableSummary(plan)).toBe("新增 0 节、调走 0 节、删除 0 节、未变 2 节");
  });

  it("新课表多一节：新增 1 节", () => {
    const before = [block("高等数学", 3, 8 * 60)];
    const after = [block("高等数学", 3, 8 * 60), block("大学物理", 5, 14 * 60)];
    const plan = planTimetableCoverage(before, after);
    expect(plan.summary.added).toBe(1);
    expect(plan.summary.unchanged).toBe(1);
    expect(plan.hasDestructiveChange).toBe(true);
    expect(plan.changes.find((c) => c.kind === "added")?.note).toContain("大学物理");
  });

  it("调课到周四：算「调走 1 节」，不算删了再新增", () => {
    const before = [block("数据结构", 3, 10 * 60)];
    const after = [block("数据结构", 4, 10 * 60)];
    const plan = planTimetableCoverage(before, after);
    expect(plan.summary).toMatchObject({ added: 0, updated: 1, removed: 0, unchanged: 0 });
    expect(plan.changes[0]?.note).toContain("周三 10:00 → 周四 10:00");
  });

  it("同一门课一周两节：没变的那节不能被算成「调走」", () => {
    const before = [block("高等数学", 2, 8 * 60), block("高等数学", 4, 8 * 60)];
    const after = [block("高等数学", 2, 8 * 60), block("高等数学", 4, 10 * 60)];
    const plan = planTimetableCoverage(before, after);
    // 周二那节没变；周四那节从 08:00 挪到 10:00
    expect(plan.summary).toMatchObject({ added: 0, updated: 1, removed: 0, unchanged: 1 });
  });

  it("新课表删掉一门课：删除 1 节（破坏性变更，必须让用户看见）", () => {
    const before = [block("高等数学", 3, 8 * 60), block("形势与政策", 5, 16 * 60)];
    const after = [block("高等数学", 3, 8 * 60)];
    const plan = planTimetableCoverage(before, after);
    expect(plan.summary.removed).toBe(1);
    expect(plan.hasDestructiveChange).toBe(true);
    expect(plan.changes.find((c) => c.kind === "removed")?.title).toBe("形势与政策");
  });

  it("换了教室：同名字同时间，按「调走」处理并保留 taskId 供 store 原地改", () => {
    const before = [block("大学物理", 5, 14 * 60, { taskId: "t_phys", location: "二教304" })];
    const after = [block("大学物理", 5, 14 * 60, { location: "三教201" })];
    const plan = planTimetableCoverage(before, after);
    expect(plan.summary.updated).toBe(1);
    expect(plan.changes[0]?.before?.taskId).toBe("t_phys");
    expect(plan.changes[0]?.after?.location).toBe("三教201");
  });

  it("确定性：同一对输入跑两次，changes 与 summary 逐字段相同", () => {
    const before = [block("高数", 1, 480), block("英语", 3, 600), block("体育", 5, 960)];
    const after = [block("高数", 1, 480), block("英语", 4, 600), block("物理", 5, 960)];
    expect(planTimetableCoverage(before, after)).toEqual(planTimetableCoverage(before, after));
  });

  it("空新课表：全部删除（这是最容易误伤用户的一步，必须能算出来）", () => {
    const before = [block("高数", 1, 480), block("英语", 3, 600)];
    const plan = planTimetableCoverage(before, []);
    expect(plan.summary).toMatchObject({ added: 0, removed: 2, unchanged: 0 });
    expect(plan.hasDestructiveChange).toBe(true);
  });

  it("首次导入（旧课表为空）：全部新增", () => {
    const plan = planTimetableCoverage([], [block("高数", 1, 480)]);
    expect(plan.summary).toMatchObject({ added: 1, removed: 0 });
  });
});

describe("normalizeCourseTitle", () => {
  it("全角转半角、去标点空白", () => {
    expect(normalizeCourseTitle("　高等数学（上） ")).toBe(normalizeCourseTitle("高等数学(上)"));
  });

  it("不做同义合并：高数 ≠ 高等数学（宁可报新增，也不猜）", () => {
    expect(normalizeCourseTitle("高数")).not.toBe(normalizeCourseTitle("高等数学"));
  });
});

describe("weekdayFromLabel", () => {
  it("认出中文星期", () => {
    expect(weekdayFromLabel("周三")).toBe(3);
    expect(weekdayFromLabel("星期日")).toBe(7);
    expect(weekdayFromLabel("礼拜天")).toBe(7);
  });

  it("认不出来就返回 null，不猜", () => {
    expect(weekdayFromLabel("下节课")).toBeNull();
  });
});
