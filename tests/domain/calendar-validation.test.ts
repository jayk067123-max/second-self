import { describe, expect, it } from "vitest";
import { emptyAccountWorkspace, AccountWorkspaceSchema } from "@/domain/account";
import { ParseImageRequestSchema, ParseTasksRequestSchema, ReplanRequestSchema } from "@/domain/schemas/api";
import { DayKeySchema, TimestampSchema } from "@/domain/schemas/date";
import { TaskDraftSchema, TaskSchema } from "@/domain/schemas/task";
import { PlanBlockSchema } from "@/domain/schemas/reflow";
import { parseIsoToMs } from "@/domain/time";
import { makeTask } from "../helpers/fixtures";

describe("真实日历日期校验", () => {
  it.each(["2026-02-30", "2026-02-29", "2026-13-01", "2026-04-31"])("拒绝不存在的日期 %s", day => {
    expect(DayKeySchema.safeParse(day).success).toBe(false);
    expect(TimestampSchema.safeParse(day + "T09:00:00+08:00").success).toBe(false);
    expect(parseIsoToMs(day + "T09:00:00+08:00")).toBeNull();
  });

  it.each(["2024-02-29", "2026-10-26T09:30", "2026-10-26T09:30:00+08:00", "2026-10-26T01:30:00.000Z"])("保留有效日期与本地/带时区时间 %s", value => {
    expect(TimestampSchema.safeParse(value).success).toBe(true);
  });

  it("Task、草稿及重排块拒绝日期自动滚到下个月", () => {
    const task = makeTask({ start: "2026-02-30T09:00:00+08:00", end: "2026-02-30T10:00:00+08:00" });
    expect(TaskSchema.safeParse(task).success).toBe(false);
    expect(TaskDraftSchema.safeParse(task).success).toBe(false);
    expect(TaskSchema.safeParse({ ...makeTask(), deadline: "2026-02-30" }).success).toBe(false);
    expect(TaskSchema.safeParse({ ...makeTask(), completedOn: ["2026-02-30"] }).success).toBe(false);
    expect(PlanBlockSchema.safeParse({ taskId: task.id, start: task.start, end: task.end }).success).toBe(false);
  });

  it("账号学期、撤销快照及演示时钟使用同一校验", () => {
    const workspace = emptyAccountWorkspace("测试");
    expect(AccountWorkspaceSchema.safeParse(workspace).success).toBe(true);
    expect(AccountWorkspaceSchema.safeParse({ ...workspace, planner: { ...workspace.planner, termStartDayKey: "2026-02-30" } }).success).toBe(false);
    expect(AccountWorkspaceSchema.safeParse({ ...workspace, planner: { ...workspace.planner, snapshotTermStart: "2026-02-30" } }).success).toBe(false);
    expect(AccountWorkspaceSchema.safeParse({ ...workspace, planner: { ...workspace.planner, demoClock: { iso: "2026-02-30T09:00:00Z", source: "seed" } } }).success).toBe(false);
  });

  it("三个AI请求都拒绝非法上下文日期", () => {
    const dayKey = "2026-02-30";
    expect(ParseTasksRequestSchema.safeParse({ text: "明天学习一小时", dayKey }).success).toBe(false);
    expect(ParseImageRequestSchema.safeParse({ imageDataUrl: "data:image/png;base64," + "a".repeat(80), dayKey }).success).toBe(false);
    expect(ReplanRequestSchema.safeParse({ tasks: [], dayKey }).success).toBe(false);
    expect(ReplanRequestSchema.safeParse({ tasks: [], dayKey: "2026-10-26", termStartDayKey: dayKey }).success).toBe(false);
  });
});
