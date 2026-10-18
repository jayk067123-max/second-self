import { describe, expect, it } from "vitest";
import { migrateStoredPayload } from "@/data/migrate";
import {
  CONFLICT_TYPE_LABEL,
  DEFAULT_DETECT_CONFIG,
  conflictedTaskIds,
  dailyTotals,
  describeConflict,
  detectConflicts,
  foldConflicts,
  minutesOnDay,
  timedTasksOf,
} from "@/domain/conflicts";
import type { Conflict, ConflictType, DetectConfig } from "@/domain/conflicts";
import { isWeekActive, termWeekOf } from "@/domain/schedule";
import { AiTaskDraftSchema, RepeatRuleSchema, TaskSchema, type Task } from "@/domain/schemas/task";
import { expandOccurrences, isoWeekdayOf } from "@/domain/time";
import { DAY, DEMO_NOW, NEXT_DAY, block, ddl, hhmm, overnight, point } from "./support/tasks";

/**
 * 冲突检测单测。
 *
 * 断言口径：所有时间都通过「某本地日的第几分钟」构造再转 ISO，所以这些用例
 * 在任意时区的机器上都成立；所有 now 都显式注入（DEMO_NOW），没有任何用例
 * 依赖"跑测试的那一天"。这本身就是"确定性"的可执行证据。
 */

const detect = (
  tasks: readonly Task[],
  config: DetectConfig = DEFAULT_DETECT_CONFIG,
  now: Date = DEMO_NOW,
): Conflict[] => detectConflicts(tasks, config, now);

const only = (conflicts: readonly Conflict[], type: ConflictType): Conflict[] =>
  conflicts.filter((conflict) => conflict.conflictType === type);

describe("detectConflicts · 规则1 时间重叠（overlap）", () => {
  it("A1-1 首尾相接不算重叠：半开区间 [9,10) 与 [10,11) 交集为空", () => {
    const a = block(DAY, 9, 0, 10, 0);
    const b = block(DAY, 10, 0, 11, 0);
    const conflicts = detect([a, b]);
    // 不报重叠 —— 同时"零间隔赶场"这个真实痛点必须由规则2接住，不能两头都不报
    expect(only(conflicts, "overlap")).toHaveLength(0);
    expect(only(conflicts, "buffer")).toHaveLength(1);
  });

  it("A1-2 部分重叠 30 分钟判 medium，并给出重叠分钟数", () => {
    const a = block(DAY, 9, 0, 10, 0);
    const b = block(DAY, 9, 30, 10, 30);
    const overlaps = only(detect([a, b]), "overlap");
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.severity).toBe("medium");
    expect(overlaps[0]?.evidence.overlapMin).toBe(30);
  });

  it("A1-3 一方完全包含另一方判 high（物理上没有可协商空间）", () => {
    const outer = block(DAY, 9, 0, 11, 0);
    const inner = block(DAY, 9, 30, 10, 0);
    const overlaps = only(detect([outer, inner]), "overlap");
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.severity).toBe("high");
    expect(overlaps[0]?.evidence.containment).toBe(1);
  });

  it("A1-4 只重叠 3 分钟判 low（灰点，不刷红）", () => {
    const a = block(DAY, 9, 0, 10, 3);
    const b = block(DAY, 10, 0, 11, 0);
    const overlaps = only(detect([a, b]), "overlap");
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.severity).toBe("low");
    expect(overlaps[0]?.evidence.overlapMin).toBe(3);
  });

  it("A1-5 同一父任务拆出的片段互相之间完全不报（重叠与缓冲都不报）", () => {
    const a = block(DAY, 9, 0, 10, 0, { parentId: "p-data-structure" });
    const b = block(DAY, 10, 0, 11, 0, { parentId: "p-data-structure" });
    expect(detect([a, b])).toEqual([]);
  });

  it("跨天任务与次日凌晨的任务的重叠也能识别（按真实时间戳，不按日历日分组）", () => {
    const night = overnight(DAY, 23, 0, NEXT_DAY, 1, 0);
    const early = block(NEXT_DAY, 0, 30, 1, 30);
    const overlaps = only(detect([night, early]), "overlap");
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.evidence.overlapMin).toBe(30);
  });

  it("一方可顺延（flexible）且另一方不是固定块时降一档", () => {
    const hard = block(DAY, 9, 0, 11, 0);
    const soft = block(DAY, 9, 30, 10, 0, { flexible: true });
    const overlaps = only(detect([hard, soft]), "overlap");
    expect(overlaps[0]?.severity).toBe("medium"); // 完全包含本应 high，可协商降一档
  });

  it("部分重叠要两个固定块硬碰硬才刷红", () => {
    const a = block(DAY, 9, 0, 10, 0, { locked: true });
    const b = block(DAY, 9, 20, 10, 20, { locked: true });
    // 重叠 40 分钟 ≥ 0.6 × 60 = 36，且双方 locked
    expect(only(detect([a, b]), "overlap")[0]?.severity).toBe("high");

    const c = block(DAY, 9, 0, 10, 0);
    const d = block(DAY, 9, 20, 10, 20);
    expect(only(detect([c, d]), "overlap")[0]?.severity).toBe("medium");
  });
});

describe("detectConflicts · 规则2 缓冲不足（buffer）", () => {
  it("A2-1 同地点首尾相接：gap=0 < 10−5，判 medium", () => {
    const a = block(DAY, 9, 0, 10, 0, { location: "教室A" });
    const b = block(DAY, 10, 0, 11, 0, { location: "教室A" });
    const buffers = only(detect([a, b]), "buffer");
    expect(buffers).toHaveLength(1);
    expect(buffers[0]?.severity).toBe("medium");
    expect(buffers[0]?.evidence.gapMin).toBe(0);
    expect(buffers[0]?.evidence.requiredMin).toBe(10);
  });

  it("A2-2 同地点间隔 40 分钟：gap ≥ 10−5，不报", () => {
    const a = block(DAY, 9, 0, 10, 0, { location: "教室A" });
    const b = block(DAY, 10, 40, 11, 30, { location: "教室A" });
    expect(only(detect([a, b]), "buffer")).toHaveLength(0);
  });

  it("A2-3 跨校区 gap=20 低于 60 分钟通勤，判 high", () => {
    const a = block(DAY, 9, 0, 10, 0, { location: "校区A" });
    const b = block(DAY, 10, 20, 11, 0, { location: "市区鼓楼" });
    const buffers = only(detect([a, b]), "buffer");
    expect(buffers).toHaveLength(1);
    expect(buffers[0]?.severity).toBe("high");
    expect(buffers[0]?.evidence.requiredMin).toBe(60);
    expect(buffers[0]?.evidence.venue).toBe("cross-campus");
  });

  it("A2-4 两条都可顺延时不报（都能挪，提醒没意义）", () => {
    const a = block(DAY, 9, 0, 10, 0, { location: "教室A", flexible: true });
    const b = block(DAY, 10, 0, 11, 0, { location: "教室A", flexible: true });
    expect(detect([a, b])).toEqual([]);
  });

  it("A2-5 21:00 收工接次日 8:00：夜间不套用通勤缓冲", () => {
    const a = block(DAY, 21, 0, 22, 0);
    const b = block(NEXT_DAY, 8, 0, 9, 0);
    expect(detect([a, b])).toEqual([]);
  });

  it("差 2 分钟不报（容差 5 分钟，避免过度敏感）", () => {
    // 跨校区要求 60，容差 5 → gap 55 恰好达标不报；gap 50 才报
    const a = block(DAY, 9, 0, 10, 0, { location: "校区A" });
    const ok = block(DAY, 10, 55, 11, 30, { location: "市区鼓楼" });
    expect(only(detect([a, ok]), "buffer")).toHaveLength(0);

    const tight = block(DAY, 10, 50, 11, 30, { location: "市区鼓楼" });
    expect(only(detect([a, tight]), "buffer")).toHaveLength(1);
  });

  it("【本项目补充定义】同校区不同楼：间隔 20 分钟不报（三教105 → 三教201）", () => {
    // SPEC A2 只有 同地点10 / 跨校区60 / 默认30 三档；按默认 30 会把正常课间全刷黄，
    // 所以补了第四档"同校区不同楼 = 20 分钟"，判据来自 demo-seed 的真实课表。
    const a = block(DAY, 8, 0, 9, 40, { location: "三教105" });
    const b = block(DAY, 10, 0, 11, 40, { location: "三教201" });
    expect(only(detect([a, b]), "buffer")).toHaveLength(0);
    expect(
      only(
        detect([a, b], {
          ...DEFAULT_DETECT_CONFIG,
          gapMin: { ...DEFAULT_DETECT_CONFIG.gapMin, sameCampus: 40 },
        }),
        "buffer",
      ),
    ).toHaveLength(1);
  });

  it("【本项目补充定义】线上地点按默认 30 分钟算，不按同地点 10 分钟算", () => {
    // 线上会没有通勤成本，但也不该被当成"同一间屋子"：
    // 两头都是线上、间隔 30 分钟 → 达标不报（按同地点 10 分钟就只剩 30≥5 也达标，
    // 真正的差别在下面那条：线上 接 线下，gap=0 时必须判 high 而不是 low）。
    const online1 = block(DAY, 21, 0, 21, 30, { location: "线上" });
    const online2 = block(DAY, 22, 0, 23, 30, { location: "线上" });
    expect(only(detect([online1, online2]), "buffer")).toHaveLength(0);
  });

  it("【本项目补充定义】线上 接 线下、gap=0 → high（seed 里那条 buffer 的判据）", () => {
    const meeting = block(DAY, 18, 30, 21, 0, { location: "学院楼301" });
    const online = block(DAY, 21, 0, 21, 30, { location: "线上" });
    const buffers = only(detect([meeting, online]), "buffer");
    expect(buffers).toHaveLength(1);
    expect(buffers[0]?.severity).toBe("high");
    expect(buffers[0]?.evidence.requiredMin).toBe(30);
    expect(buffers[0]?.evidence.venue).toBe("virtual");
  });

  it("地点未知时降为灰点（信息不足不替用户假设）", () => {
    const a = block(DAY, 9, 0, 10, 0);
    const b = block(DAY, 10, 5, 11, 0);
    const buffers = only(detect([a, b]), "buffer");
    expect(buffers).toHaveLength(1);
    expect(buffers[0]?.severity).toBe("low");
  });

  it("零时长任务不产生缓冲判定（它没占用任何时刻）", () => {
    const a = block(DAY, 9, 0, 10, 0);
    const zero = point(DAY, 10, 5);
    expect(detect([a, zero])).toEqual([]);
  });

  it("阈值可配：把同地点要求提到 30 分钟后，10 分钟间隔就要报", () => {
    const config: DetectConfig = {
      ...DEFAULT_DETECT_CONFIG,
      gapMin: { ...DEFAULT_DETECT_CONFIG.gapMin, sameVenue: 30 },
    };
    const a = block(DAY, 9, 0, 10, 0, { location: "教室A" });
    const b = block(DAY, 10, 10, 11, 0, { location: "教室A" });
    const buffers = only(detect([a, b], config), "buffer");
    expect(buffers).toHaveLength(1);
    expect(buffers[0]?.evidence.requiredMin).toBe(30);
  });
});

describe("detectConflicts · 规则3 单日超载（overload）", () => {
  const venue = { location: "教室A" };

  it("A3-1 5 条任务共 700 分钟：超出 100 分钟判 medium", () => {
    const tasks = [
      block(DAY, 8, 0, 10, 20, venue),
      block(DAY, 10, 30, 12, 50, venue),
      block(DAY, 13, 0, 15, 20, venue),
      block(DAY, 15, 30, 17, 50, venue),
      block(DAY, 18, 0, 20, 20, venue),
    ];
    const overloads = only(detect(tasks), "overload");
    expect(overloads).toHaveLength(1);
    expect(overloads[0]?.severity).toBe("medium");
    expect(overloads[0]?.evidence.overMin).toBe(100);
    expect(overloads[0]?.evidence.taskCount).toBe(5);
  });

  it("A3-2 2 条任务共 800 分钟：任务数 < 3 不判超载", () => {
    const tasks = [block(DAY, 8, 0, 14, 40, venue), block(DAY, 15, 0, 21, 40, venue)];
    expect(only(detect(tasks), "overload")).toHaveLength(0);
  });

  it("A3-3 3 条任务 900 分钟含一条 done 120 分钟：按剩余 780 分钟判定", () => {
    const tasks = [
      block(DAY, 8, 0, 10, 0, { ...venue, done: true }),
      block(DAY, 10, 30, 13, 50, venue),
      block(DAY, 14, 0, 23, 40, venue),
    ];
    const overloads = only(detect(tasks), "overload");
    expect(overloads).toHaveLength(1);
    expect(overloads[0]?.evidence.usedMin).toBe(900);
    expect(overloads[0]?.evidence.doneOffsetMin).toBe(120);
    expect(overloads[0]?.evidence.effectiveMin).toBe(780);
    expect(overloads[0]?.evidence.overMin).toBe(180);
    // 分级按 SPEC 的分级表（150 分钟以上 = high）。SPEC 用例 A3-3 这一行写的是
    // medium，与它自己的分级表冲突，已报主Bot裁决；这里断言表，保证实现自洽。
    expect(overloads[0]?.severity).toBe("high");
  });

  it("A3-4 跨夜 22:00–01:00 按零点切开：当日 120 分钟 + 次日 60 分钟", () => {
    const night = overnight(DAY, 22, 0, NEXT_DAY, 1, 0);
    const totals = dailyTotals(timedTasksOf([night]));
    expect(totals.get(DAY)).toBe(120);
    expect(totals.get(NEXT_DAY)).toBe(60);
    expect(minutesOnDay([night], DAY)).toBe(120);
  });

  it("微任务（< 15 分钟且无地点）从日用量里剔除，但仍算一件做过的事", () => {
    const tasks = [
      block(DAY, 8, 0, 14, 0, venue),
      block(DAY, 14, 0, 20, 0, venue),
      block(DAY, 20, 0, 20, 10, { location: null }),
    ];
    const overloads = only(detect(tasks), "overload");
    expect(overloads).toHaveLength(1);
    expect(overloads[0]?.evidence.usedMin).toBe(720); // 不含那 10 分钟
    expect(overloads[0]?.evidence.taskCount).toBe(3);
  });

  it("锁定集中日（固定块占一半以上）超载只出 medium，不出红", () => {
    const tasks = [
      block(DAY, 8, 0, 12, 40, { locked: true }),
      block(DAY, 13, 0, 18, 0, { locked: true }),
      block(DAY, 18, 30, 22, 10, { locked: true }),
    ];
    const overloads = only(detect(tasks), "overload");
    const capacityConflict = overloads.find((conflict) => conflict.evidence.trigger !== "classLoad");
    expect(capacityConflict?.severity).toBe("medium");
    expect(capacityConflict?.evidence.overMin).toBe(200);
  });

  it("固定课满载预警与超载可并存，且独立成一条", () => {
    const tasks = [
      block(DAY, 8, 0, 12, 40, { locked: true }),
      block(DAY, 13, 0, 18, 0, { locked: true }),
      block(DAY, 18, 30, 22, 10, { locked: true }),
    ];
    const classLoad = only(detect(tasks), "overload").filter(
      (conflict) => conflict.evidence.trigger === "classLoad",
    );
    expect(classLoad).toHaveLength(1);
    expect(classLoad[0]?.severity).toBe("medium");
    expect(classLoad[0]?.evidence.classMin).toBe(800);
  });

  it("已完成的任务仍计入当日已用量，再按剩余量判定（时间确实被占过了）", () => {
    const tasks = [
      block(DAY, 8, 0, 10, 0, { ...venue, done: true }),
      block(DAY, 10, 30, 15, 30, venue),
      block(DAY, 15, 45, 20, 45, venue),
      block(DAY, 21, 0, 22, 40, venue),
    ];
    const overloads = only(detect(tasks), "overload");
    expect(overloads).toHaveLength(1);
    expect(overloads[0]?.evidence.usedMin).toBe(820);
    expect(overloads[0]?.evidence.doneOffsetMin).toBe(120);
    expect(overloads[0]?.evidence.effectiveMin).toBe(700);
    expect(overloads[0]?.evidence.overMin).toBe(100);
  });
});

describe("detectConflicts · 规则4 截止日逼近（deadline）", () => {
  it("已经排不下（slack < 0）判 high", () => {
    const task = ddl(hhmm(NEXT_DAY, 12, 0), { estateMin: 480, priority: 3 });
    const deadlines = only(detect([task]), "deadline");
    expect(deadlines).toHaveLength(1);
    expect(deadlines[0]?.severity).toBe("high");
    expect(deadlines[0]?.evidence.slackH).toBe(-5);
  });

  it("进入提前预警窗口但仍排得下：medium", () => {
    const task = ddl(hhmm(NEXT_DAY, 12, 0), { estateMin: 60, priority: 1 });
    const deadlines = only(detect([task]), "deadline");
    expect(deadlines).toHaveLength(1);
    expect(deadlines[0]?.severity).toBe("medium");
    expect(deadlines[0]?.evidence.leadHours).toBe(72);
  });

  it("已逾期的任务判 high（事实发生了，比可能排不下更严重）", () => {
    const task = ddl(hhmm(DAY, 12, 0), { estateMin: 30 });
    const deadlines = only(detect([task]), "deadline");
    expect(deadlines).toHaveLength(1);
    expect(deadlines[0]?.severity).toBe("high");
    expect(String(deadlines[0]?.humanMessage)).toContain("逾期");
  });

  it("done 任务不产生截止提醒", () => {
    const task = ddl(hhmm(DAY, 12, 0), { estateMin: 30, done: true });
    expect(only(detect([task]), "deadline")).toHaveLength(0);
  });

  it("进度 ≥ 0.8 的任务最高只出灰点", () => {
    const task = ddl(hhmm(NEXT_DAY, 12, 0), { estateMin: 480, progress: 0.9 });
    const deadlines = only(detect([task]), "deadline");
    expect(deadlines).toHaveLength(1);
    expect(deadlines[0]?.severity).toBe("low");
  });

  it("没有具体时刻的 deadline 视为当日 23:59（不凭空提前一天报红）", () => {
    const task = ddl("2026-10-19", { estateMin: 60, priority: 3 });
    const deadlines = only(detect([task]), "deadline");
    expect(deadlines).toHaveLength(1);
    expect(deadlines[0]?.date).toBe("2026-10-19");
    // 09:00 → 23:59 = 14 小时 59 分，四舍五入一位小数即 15
    expect(deadlines[0]?.evidence.remainH).toBe(15);
  });

  it("还没进预警窗口的任务不报（不是漏报，是 SPEC 要求别打扰）", () => {
    const task = ddl(hhmm("2026-10-25", 12, 0), { estateMin: 60, priority: 3 });
    expect(only(detect([task]), "deadline")).toHaveLength(0);
  });

  it("当日超载已刷红时，截止卡降为 medium（同一件事不报两条红）", () => {
    const venue = { location: "教室A" };
    const tasks = [
      block(NEXT_DAY, 8, 0, 12, 0, venue),
      block(NEXT_DAY, 13, 0, 17, 0, venue),
      block(NEXT_DAY, 17, 30, 23, 10, venue),
      ddl(hhmm(NEXT_DAY, 12, 0), { estateMin: 480, priority: 3 }),
    ];
    const conflicts = detect(tasks);
    const overloads = only(conflicts, "overload");
    expect(overloads[0]?.severity).toBe("high");
    const deadlines = only(conflicts, "deadline");
    expect(deadlines[0]?.severity).toBe("medium");
  });
});

describe("detectConflicts · 全局约定（去重 / 排序 / 上限 / 确定性）", () => {
  it("同一对任务只出一条冲突：重叠优先，不再重复报缓冲", () => {
    const a = block(DAY, 9, 0, 10, 0, { location: "教室A" });
    const b = block(DAY, 9, 30, 10, 30, { location: "教室A" });
    const conflicts = detect([a, b]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.conflictType).toBe("overlap");
  });

  it("排序固定：severity（high→low）→ date → 当天时间 → 类型", () => {
    const outer = block(DAY, 9, 0, 11, 0);
    const inner = block(DAY, 9, 30, 10, 0);
    const a = block(DAY, 13, 0, 14, 0);
    const b = block(DAY, 14, 10, 15, 0);
    const conflicts = detect([outer, inner, a, b]);
    const rank = { high: 0, medium: 1, low: 2 } as const;
    const ranks = conflicts.map((conflict) => rank[conflict.severity]);
    expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
    expect(conflicts[0]?.conflictType).toBe("overlap");
  });

  it("同输入三次运行输出逐字节一致（确定性，含 detectedAt）", () => {
    const tasks = [
      block(DAY, 9, 0, 10, 0, { location: "教室A" }),
      block(DAY, 10, 0, 11, 0, { location: "教室A" }),
      block(DAY, 13, 0, 14, 0),
      ddl(hhmm(NEXT_DAY, 12, 0), { estateMin: 60 }),
    ];
    const runs = [detect(tasks), detect(tasks), detect(tasks)].map((run) => JSON.stringify(run));
    expect(runs[1]).toBe(runs[0]);
    expect(runs[2]).toBe(runs[0]);
  });

  it("冲突 id 形状固定：`${type}:${排序后的 taskId}`", () => {
    const a = block(DAY, 9, 0, 10, 0);
    const b = block(DAY, 9, 30, 10, 30);
    const [conflict] = detect([a, b]);
    expect(conflict?.conflictId).toBe(`overlap:${[a.id, b.id].sort().join("+")}`);
    expect(conflict?.ruleVersion).toBe("rules/v1");
    expect(conflict?.detectedAt).toBe(DEMO_NOW.toISOString());
  });

  it("humanMessage 全部 ≤ 40 字且带数字锚点", () => {
    const tasks = [
      block(DAY, 9, 0, 11, 0, { location: "教室A" }),
      block(DAY, 9, 30, 10, 0, { location: "教室A" }),
      block(DAY, 13, 0, 14, 0, { location: "校区A" }),
      block(DAY, 14, 10, 15, 0, { location: "市区鼓楼" }),
      ddl(hhmm(NEXT_DAY, 12, 0), { estateMin: 480 }),
    ];
    const conflicts = detect(tasks);
    expect(conflicts.length).toBeGreaterThan(0);
    for (const conflict of conflicts) {
      expect(conflict.humanMessage.length).toBeLessThanOrEqual(40);
      expect(/\d/.test(conflict.humanMessage)).toBe(true);
      expect(describeConflict(conflict)).toBe(conflict.humanMessage);
    }
  });

  it("卡片上限：前 5 条展示，其余折叠成「另外 N 条」", () => {
    const [conflict] = detect([block(DAY, 9, 0, 10, 0), block(DAY, 9, 30, 10, 30)]);
    expect(conflict).toBeDefined();
    const many: Conflict[] = Array.from({ length: 7 }, (_, index) => ({
      ...conflict!,
      conflictId: `overlap:x${index}`,
    }));
    const folded = foldConflicts(many);
    expect(folded.shown).toHaveLength(5);
    expect(folded.foldedCount).toBe(2);
  });

  it("空输入返回空数组，不抛错", () => {
    expect(detect([])).toEqual([]);
  });

  it("now 不合法时立刻抛错（而不是偷偷退回 Date.now）", () => {
    expect(() => detect([], DEFAULT_DETECT_CONFIG, new Date(Number.NaN))).toThrow(TypeError);
  });

  it("不修改入参（纯函数）", () => {
    const a = block(DAY, 9, 0, 10, 0);
    const b = block(DAY, 9, 30, 10, 30);
    const snapshot = JSON.stringify([a, b]);
    detect([a, b]);
    expect(JSON.stringify([a, b])).toBe(snapshot);
  });

  it("conflictedTaskIds 汇总涉及的任务（UI 打红点用）", () => {
    const a = block(DAY, 9, 0, 10, 0);
    const b = block(DAY, 9, 30, 10, 30);
    const ids = conflictedTaskIds(detect([a, b]));
    expect(ids.has(a.id)).toBe(true);
    expect(ids.has(b.id)).toBe(true);
  });

  it("CONFLICT_TYPE_LABEL 覆盖全部 4 类（卡片 badge 文案）", () => {
    expect(Object.keys(CONFLICT_TYPE_LABEL).sort()).toEqual([
      "buffer",
      "deadline",
      "overlap",
      "overload",
    ]);
  });
});

describe("任务契约", () => {
  it("约束字段可选且能通过 TaskSchema 校验（不破坏旧数据）", () => {
    const full = block(DAY, 9, 0, 10, 0, {
      location: "教室A",
      locked: true,
      flexible: false,
      parentId: "p1",
      progress: 0.5,
      estateMin: 90,
    });
    expect(TaskSchema.safeParse(full).success).toBe(true);
    expect(TaskSchema.safeParse(block(DAY, 9, 0, 10, 0)).success).toBe(true);
  });

  it("零时长任务合法（只有 DDL 的任务 durationMin 可以为 0）", () => {
    expect(TaskSchema.safeParse(ddl("2026-10-19")).success).toBe(true);
  });

  it("已经落盘的旧记录（只有 10 个基础字段）：严格契约下由 data/migrate 归一化补齐，不整批判脏", () => {
    const legacy = {
      id: "old-1",
      title: "旧任务",
      start: null,
      end: null,
      durationMin: 30,
      deadline: null,
      priority: 2,
      source: "manual",
      done: false,
      rawTextOrigin: null,
    };
    // TaskSchema 已改为严格契约（locked / repeat / needsReview 必填，不允许静默通过），
    // 旧数据的兼容职责挪到持久化适配层的 v2→v3 迁移里
    const migrated = migrateStoredPayload({ tasks: [legacy], snapshot: null });
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    const parsed = migrated.value.tasks[0];
    expect(parsed?.locked).toBe(false);
    expect(parsed?.repeat).toBeNull();
    expect(parsed?.needsReview).toBe(false);
  });

  it("repeat 的 byDay 用 ISO 星期（1=周一…7=周日），0 和 8 都非法", () => {
    expect(RepeatRuleSchema.safeParse({ kind: "weekly", byDay: [2] }).success).toBe(true);
    expect(RepeatRuleSchema.safeParse({ kind: "weekly", byDay: [0] }).success).toBe(false);
    expect(RepeatRuleSchema.safeParse({ kind: "weekly", byDay: [8] }).success).toBe(false);
    expect(RepeatRuleSchema.safeParse({ kind: "weekly", byDay: [] }).success).toBe(false);
    expect(isoWeekdayOf(Date.parse(hhmm("2026-10-20", 21, 0)))).toBe(2); // 2026-10-20 是周二
  });

  it("AI 草稿可以带 repeat、但不能自己设 locked（模型无权）", () => {
    const draft = {
      title: "社团例会",
      start: hhmm(DAY, 21, 0),
      end: hhmm(DAY, 22, 0),
      durationMin: 60,
      deadline: null,
      priority: 2,
      rawTextOrigin: "每周二晚9点例会",
      needsReview: false,
      repeat: { kind: "weekly", byDay: [2] },
      locked: true,
    };
    const parsed = AiTaskDraftSchema.parse(draft);
    expect(parsed.repeat).toEqual({ kind: "weekly", byDay: [2] });
    expect(parsed).not.toHaveProperty("locked");
  });
});

describe("expandOccurrences · 重复任务展开", () => {
  const weeklyTue = { kind: "weekly" as const, byDay: [2] };
  const windowStart = new Date(hhmm("2026-10-19", 0, 0));
  const windowEnd = new Date(hhmm("2026-11-02", 0, 0));

  it("单次任务原样返回，不按窗口过滤（窗口外的历史任务不能被静默丢掉）", () => {
    const task = block(DAY, 9, 0, 10, 0, { id: "single" });
    const farWindow = [new Date(hhmm("2027-01-01", 0, 0)), new Date(hhmm("2027-01-08", 0, 0))] as const;
    const occurrences = expandOccurrences(task, farWindow[0], farWindow[1]);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]?.start).toBe(task.start);
  });

  it("weekly 任务在两周窗口内展开出两个周二，时刻与时长取自任务本身", () => {
    const task = block(DAY, 21, 0, 22, 0, { id: "weekly", repeat: weeklyTue });
    const occurrences = expandOccurrences(task, windowStart, windowEnd);
    expect(occurrences).toHaveLength(2);
    expect(occurrences[0]?.start).toBe(hhmm("2026-10-20", 21, 0));
    expect(occurrences[0]?.end).toBe(hhmm("2026-10-20", 22, 0));
    expect(occurrences[1]?.start).toBe(hhmm("2026-10-27", 21, 0));
    // 数据里始终只有一条任务
    expect(task.repeat).toEqual(weeklyTue);
  });

  it("展开只看窗口、不看今天：换一个更远的窗口照样能展开", () => {
    const task = block(DAY, 21, 0, 22, 0, { repeat: weeklyTue });
    const later = expandOccurrences(task, new Date(hhmm("2026-11-05", 0, 0)), new Date(hhmm("2026-11-20", 0, 0)));
    expect(later.map((occurrence) => occurrence.start)).toEqual([
      hhmm("2026-11-10", 21, 0),
      hhmm("2026-11-17", 21, 0),
    ]);
  });

  it("byDay 多天时逐个展开（周一 + 周三 → 两周 4 次）", () => {
    const task = block(DAY, 8, 0, 9, 0, { repeat: { kind: "weekly", byDay: [1, 3] } });
    const occurrences = expandOccurrences(task, windowStart, windowEnd);
    expect(occurrences).toHaveLength(4);
  });

  it("没有具体时段的重复安排不展开（交给截止规则，硬造时段只会造假冲突）", () => {
    const task = ddl(hhmm("2026-10-20", 23, 59), { repeat: weeklyTue });
    expect(expandOccurrences(task, windowStart, windowEnd)).toEqual([]);
  });

  it("窗口倒置返回空，窗口非法抛错（不让坏参数悄悄变成空结果）", () => {
    const task = block(DAY, 21, 0, 22, 0, { repeat: weeklyTue });
    expect(expandOccurrences(task, windowEnd, windowStart)).toEqual([]);
    expect(() => expandOccurrences(task, new Date(Number.NaN), windowEnd)).toThrow(TypeError);
  });
});

describe("detectConflicts · 重复任务（数据一行，判定按每次发生）", () => {
  const weeklyTue = { kind: "weekly" as const, byDay: [2] };

  it("周二 21:00 的例会能撞上下周二 21:00 结束的会（视频里那条镜头不能丢）", () => {
    const meeting = block(DAY, 21, 0, 22, 0, { id: "r", title: "社团例会", repeat: weeklyTue });
    const clash = block("2026-10-20", 20, 30, 21, 0, { id: "m", title: "部门会议" });
    const buffers = only(detect([meeting, clash]), "buffer");
    expect(buffers).toHaveLength(1);
    expect(buffers[0]?.date).toBe("2026-10-20");
    expect(buffers[0]?.conflictId).toContain("@2026-10-20");
    // 冲突指向的是"那一条任务"，不是展开出来的临时对象
    expect(buffers[0]?.involvedTaskIds).toContain("r");
  });

  it("两周都撞 → 两条冲突、id 不同（不会被去重吞成一条）", () => {
    const meeting = block(DAY, 21, 0, 22, 0, { id: "r", title: "社团例会", repeat: weeklyTue });
    const clashA = block("2026-10-20", 20, 30, 21, 0, { id: "ma", title: "部门会议" });
    const clashB = block("2026-10-27", 20, 30, 21, 0, { id: "mb", title: "部门会议" });
    const buffers = only(detect([meeting, clashA, clashB]), "buffer");
    expect(buffers).toHaveLength(2);
    expect(buffers.map((conflict) => conflict.date)).toEqual(["2026-10-20", "2026-10-27"]);
    expect(new Set(buffers.map((conflict) => conflict.conflictId)).size).toBe(2);
  });

  it("已经写死的单次任务不受影响：id 形状不变（兼容既有 UI key）", () => {
    const a = block(DAY, 9, 0, 10, 0, { id: "a" });
    const b = block(DAY, 9, 30, 10, 30, { id: "b" });
    const [conflict] = detect([a, b]);
    expect(conflict?.conflictId).toBe(`overlap:${[a.id, b.id].sort().join("+")}`);
    expect(conflict?.conflictId).not.toContain("@");
  });

  it("窗口之外（14 天以后）的撞车不算今天要处理的事", () => {
    const meeting = block(DAY, 21, 0, 22, 0, { id: "r", repeat: weeklyTue });
    const far = block("2026-11-10", 20, 30, 21, 0, { id: "far" });
    expect(only(detect([meeting, far]), "buffer")).toHaveLength(0);
  });

  it("重复任务也参与单日超载计算（那一周真的排满了）", () => {
    const venue = { location: "教室A" };
    const meeting = block("2026-10-20", 21, 0, 22, 0, {
      id: "r",
      repeat: weeklyTue,
      ...venue,
    });
    const tasks = [
      block("2026-10-20", 8, 0, 13, 0, venue),
      block("2026-10-20", 14, 0, 19, 0, venue),
      meeting,
    ];
    const overloads = only(detect(tasks), "overload");
    expect(overloads).toHaveLength(1);
    // 300 + 300 + 60 = 660，超出上限 60 分钟
    expect(overloads[0]?.evidence.usedMin).toBe(660);
    expect(overloads[0]?.date).toBe("2026-10-20");
  });
});

describe("重复任务 · 周次过滤（需求定义书 v1.2 §4.1①）", () => {
  /** 2026-09-14 是周一；它同时也是日历年 ISO 第 38 周（偶数），用来验证"以学期周为基准" */
  const TERM_START = "2026-09-14";
  const weeklyTue = { kind: "weekly" as const, byDay: [2] };

  it("判定顺序固定 范围 → 单双周 → 排除周：排除周是否决票，救不回来", () => {
    const spec = { from: 3, to: 9, parity: "odd" as const, except: [5] };
    // 第 5 周既在范围内、又是单周 —— 但被显式排除，必须否决
    expect(isWeekActive(5, spec)).toBe(false);
    expect(isWeekActive(7, spec)).toBe(true);
    // 第 4 周在范围内但是双周 → 被单双周否决
    expect(isWeekActive(4, spec)).toBe(false);
    // 第 11 周是单周但超出范围 → 被范围否决（范围最先）
    expect(isWeekActive(11, spec)).toBe(false);
  });

  it("单双周以学期第几周为基准，不是日历年周", () => {
    const task = block(TERM_START, 21, 0, 22, 0, {
      id: "odd-week-class",
      repeat: { ...weeklyTue, weeks: { from: 1, to: 16, parity: "odd", except: [] } },
    });
    const occurrences = expandOccurrences(
      task,
      new Date(hhmm("2026-09-14", 0, 0)),
      new Date(hhmm("2026-10-12", 0, 0)),
      TERM_START,
    );
    // 学期第 1、3 周的周二 → 09-15、09-29。
    // 若按日历年周算（09-14 是第 38 周偶数），这里会错落在 09-22 / 10-06。
    expect(occurrences.map((occurrence) => occurrence.start)).toEqual([
      hhmm("2026-09-15", 21, 0),
      hhmm("2026-09-29", 21, 0),
    ]);
    expect(termWeekOf("2026-09-14", TERM_START)).toBe(1);
    expect(termWeekOf("2026-09-15", TERM_START)).toBe(1);
    expect(termWeekOf("2026-09-22", TERM_START)).toBe(2);
  });

  it("termWeekOf ≤ 0（开学前）不产生 occurrence，不假装第 1 周", () => {
    const task = block(TERM_START, 21, 0, 22, 0, {
      id: "odd-week-class",
      repeat: { ...weeklyTue, weeks: { from: 1, to: 16, parity: "all", except: [] } },
    });
    // 整段窗口都在开学前：09-01 是第 -1 周、09-08 是第 0 周
    expect(
      expandOccurrences(
        task,
        new Date(hhmm("2026-08-31", 0, 0)),
        new Date(hhmm("2026-09-14", 0, 0)),
        TERM_START,
      ),
    ).toEqual([]);
    expect(termWeekOf("2026-09-01", TERM_START)).toBeLessThanOrEqual(0);
    expect(termWeekOf("2026-09-08", TERM_START)).toBe(0);

    // 跨开学日的窗口：只有开学后的周二留下
    let mixed: Array<{ start: string }>;
    mixed = expandOccurrences(
      task,
      new Date(hhmm("2026-09-07", 0, 0)),
      new Date(hhmm("2026-09-22", 0, 0)),
      TERM_START,
    );
    expect(mixed.map((occurrence) => occurrence.start)).toEqual([hhmm("2026-09-15", 21, 0)]);
  });

  it("排除周在展开层同样是否决票", () => {
    const task = block(TERM_START, 21, 0, 22, 0, {
      id: "except-week",
      repeat: { ...weeklyTue, weeks: { from: 1, to: 16, parity: "all", except: [2] } },
    });
    const occurrences = expandOccurrences(
      task,
      new Date(hhmm("2026-09-14", 0, 0)),
      new Date(hhmm("2026-10-12", 0, 0)),
      TERM_START,
    );
    expect(occurrences.map((occurrence) => occurrence.start)).toEqual([
      hhmm("2026-09-15", 21, 0),
      hhmm("2026-09-29", 21, 0),
      hhmm("2026-10-06", 21, 0),
    ]);
  });

  it("没有 weeks 字段时行为与改动前完全一致（旧数据零迁移）", () => {
    const task = block(TERM_START, 21, 0, 22, 0, { id: "plain-weekly", repeat: weeklyTue });
    const occurrences = expandOccurrences(
      task,
      new Date(hhmm("2026-09-14", 0, 0)),
      new Date(hhmm("2026-10-12", 0, 0)),
      TERM_START,
    );
    expect(occurrences).toHaveLength(4);
  });

  it("带了 weeks 但没给开学日：按每周都上展开（宁可多排，不藏课）", () => {
    const task = block(TERM_START, 21, 0, 22, 0, {
      id: "no-term",
      repeat: { ...weeklyTue, weeks: { from: 1, to: 16, parity: "odd", except: [] } },
    });
    const occurrences = expandOccurrences(
      task,
      new Date(hhmm("2026-09-14", 0, 0)),
      new Date(hhmm("2026-10-12", 0, 0)),
    );
    expect(occurrences).toHaveLength(4);
  });

  it("端到端：单周课在双周那天不参与冲突判定", () => {
    const config = { ...DEFAULT_DETECT_CONFIG, termStartDayKey: TERM_START };
    const now = new Date(hhmm("2026-09-14", 9, 0));
    const oddClass = block("2026-09-15", 21, 0, 22, 0, {
      id: "odd",
      title: "单周课",
      location: "教室A",
      repeat: { ...weeklyTue, weeks: { from: 1, to: 16, parity: "odd", except: [] } },
    });

    // 对撞任务放在"单周"那天（第 1 周周二 09-15）→ 报缓冲
    const clashOnOdd = block("2026-09-15", 20, 30, 21, 0, { id: "c1", location: "教室A" });
    expect(only(detect([oddClass, clashOnOdd], config, now), "buffer")).toHaveLength(1);

    // 放在"双周"那天（第 2 周周二 09-22）→ 课根本不出现，不报
    const clashOnEven = block("2026-09-22", 20, 30, 21, 0, { id: "c2", location: "教室A" });
    expect(only(detect([oddClass, clashOnEven], config, now), "buffer")).toHaveLength(0);
  });
});
