import { describe, expect, it } from "vitest";
import { tasksOnDay } from "@/domain/avatar";
import { DEFAULT_DETECT_CONFIG, detectConflicts } from "@/domain/conflicts";
import { guardPlan } from "@/domain/planGuard";
import { validatePlan, type ReplanPlan } from "@/domain/reflow";
import { expandOccurrences } from "@/domain/time";
import { block, hhmm, overnight } from "./support/tasks";

const DAY = "2026-10-27";
const NEXT = "2026-10-28";
const now = hhmm(DAY, 8);
const context = { dayKey: DAY, now };
const planOf = (blocks: ReplanPlan["blocks"]): ReplanPlan => ({ id: "audit-plan", title: "调整安排", rationale: "错开时间", blocks });

describe("完整重排校验", () => {
  it("同时移动两项后解除冲突，不与其他项的旧位置比较", () => {
    const tasks = [block(DAY, 9, 0, 10, 0, { id: "a", location: "线上" }), block(DAY, 9, 30, 10, 30, { id: "b", location: "线上" })];
    const plan = planOf([{ taskId: "a", start: hhmm(DAY, 9, 30), end: hhmm(DAY, 10, 30) }, { taskId: "b", start: hhmm(DAY, 11), end: hhmm(DAY, 12) }]);
    expect(validatePlan(plan, tasks, DAY).ok).toBe(true);
    expect(guardPlan(plan, tasks, context)).toEqual({ ok: true, issues: [] });
  });

  it("完整方案仍拒绝新的重叠", () => {
    const tasks = [block(DAY, 9, 0, 10, 0, { id: "a" }), block(DAY, 11, 0, 12, 0, { id: "b" })];
    const plan = planOf([{ taskId: "a", start: hhmm(DAY, 13), end: hhmm(DAY, 14) }, { taskId: "b", start: hhmm(DAY, 13, 30), end: hhmm(DAY, 14, 30) }]);
    expect(guardPlan(plan, tasks, context).issues.some(issue => issue.includes("重叠"))).toBe(true);
  });

  it("合并校验仍保留调整前的每日容量基线", () => {
    const tasks = [block(DAY, 9, 0, 10, 0, { id: "move", location: "线上" }), block(NEXT, 7, 0, 19, 0, { id: "busy", location: "线上", locked: true })];
    const plan = planOf([{ taskId: "move", start: hhmm(NEXT, 20), end: hhmm(NEXT, 21) }]);
    expect(guardPlan(plan, tasks, context).issues.some(issue => issue.includes("超过上限"))).toBe(true);
  });

  it("允许顺延，旧单日校验契约保持严格", () => {
    const tasks = [block(DAY, 9, 0, 10, 0, { id: "move" })];
    const plan = planOf([{ taskId: "move", start: hhmm(NEXT, 9), end: hhmm(NEXT, 10) }]);
    expect(validatePlan(plan, tasks, DAY).ok).toBe(false);
    expect(guardPlan(plan, tasks, context).ok).toBe(true);
  });

  it("仍拒绝固定任务和已过去时段", () => {
    const tasks = [block(DAY, 9, 0, 10, 0, { id: "fixed", locked: true })];
    const plan = planOf([{ taskId: "fixed", start: hhmm(DAY, 7), end: hhmm(DAY, 8) }]);
    const result = guardPlan(plan, tasks, context);
    expect(result.issues.some(issue => issue.includes("不可自动移动"))).toBe(true);
    expect(result.issues.some(issue => issue.includes("已过去"))).toBe(true);
  });
});

describe("跨午夜周期安排", () => {
  const weekly = overnight("2026-10-19", 22, 0, "2026-10-20", 1, 0, { id: "overnight", repeat: { kind: "weekly", byDay: [1] } });
  const start = new Date(hhmm("2026-10-20", 0));
  const end = new Date(hhmm("2026-10-21", 0));

  it("保留窗口前一天开始、在窗口中结束的发生时段", () => {
    expect(expandOccurrences(weekly, start, end)).toEqual([{ taskId: weekly.id, start: hhmm("2026-10-19", 22), end: hhmm("2026-10-20", 1) }]);
    expect(tasksOnDay([weekly], "2026-10-20")).toHaveLength(1);
  });

  it("次日凌晨的重叠仍被检测到", () => {
    const other = block("2026-10-20", 0, 30, 0, 50, { id: "other" });
    const conflicts = detectConflicts([weekly, other], { ...DEFAULT_DETECT_CONFIG, repeatWindowStartDayKey: "2026-10-20" }, start);
    expect(conflicts.some(conflict => conflict.conflictType === "overlap" && conflict.date === "2026-10-20")).toBe(true);
  });

  it("恰好在窗口起点结束的时段不被带入", () => {
    const endingAtMidnight = { ...weekly, end: hhmm("2026-10-20", 0), durationMin: 120 };
    expect(expandOccurrences(endingAtMidnight, start, end)).toEqual([]);
  });

  it("回溯仍按发生日起始日的学期周次过滤", () => {
    const filtered = { ...weekly, repeat: { kind: "weekly" as const, byDay: [1], weeks: { from: 1, to: 16, parity: "even" as const, except: [] } } };
    expect(expandOccurrences(filtered, start, end, "2026-10-19")).toEqual([]);
  });
});
