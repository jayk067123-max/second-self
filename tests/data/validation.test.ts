import { beforeEach, describe, expect, it } from "vitest";
import { TaskDraftSchema, TaskListSchema, TaskSchema } from "@/domain/schemas/task";
import { AccountWorkspaceSchema, emptyAccountWorkspace } from "@/domain/account";
import { migrateImportedPayload } from "@/data/migrate";
import { usePlannerStore } from "@/data/store";
import { makeTask } from "../helpers/fixtures";

const base = makeTask({ id: "audit-task", title: "回归任务" });
const full = () => Array.from({ length: 5000 }, (_, i) => ({ ...base, id: `task-${i}` }));
beforeEach(() => usePlannerStore.setState({ tasks: [], snapshot: null, lastError: null }));

describe("导入与账号共用数据边界", () => {
  it("拒绝非法截止日期，防止日程渲染异常", () => {
    expect(TaskSchema.safeParse({ ...base, deadline: "not-a-date" }).success).toBe(false);
  });
  it("解析草稿也拒绝非法截止日期", () => {
    expect(TaskDraftSchema.safeParse({ ...base, deadline: "not-a-date" }).success).toBe(false);
  });
  it("接受带时区的有效日期和空日期", () => {
    expect(TaskSchema.safeParse({ ...base, deadline: "2026-10-31T15:00:00+08:00" }).success).toBe(true);
    expect(TaskSchema.safeParse(base).success).toBe(true);
  });
  it("拒绝重复id，避免编辑、删除误作用于多条日程", () => {
    expect(TaskListSchema.safeParse([base, { ...base, title: "另一条" }]).success).toBe(false);
  });
  it("非法导入不改变当前日程和撤销快照", () => {
    usePlannerStore.setState({ tasks: [base], snapshot: [base] });
    expect(usePlannerStore.getState().importJson(JSON.stringify({ tasks: [{ ...base, deadline: "broken" }], snapshot: null })).ok).toBe(false);
    expect(usePlannerStore.getState().tasks).toEqual([base]);
    expect(usePlannerStore.getState().snapshot).toEqual([base]);
  });
  it("导入拒绝重复id并给出可读原因", () => {
    const result = migrateImportedPayload({ tasks: [base, base], snapshot: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("重复");
  });
  it("账号API拒绝非法截止和重复id", () => {
    const workspace = emptyAccountWorkspace("测试");
    workspace.planner.tasks = [{ ...base, deadline: "broken" }];
    expect(AccountWorkspaceSchema.safeParse(workspace).success).toBe(false);
    workspace.planner.tasks = [base, base];
    expect(AccountWorkspaceSchema.safeParse(workspace).success).toBe(false);
  });
  it("导入上限与账号同步上限一致", () => {
    expect(migrateImportedPayload({ tasks: full(), snapshot: null }).ok).toBe(true);
    expect(migrateImportedPayload({ tasks: [...full(), base], snapshot: null }).ok).toBe(false);
  });
  it("满额时手动新增被拒绝且不污染撤销", () => {
    const tasks = full();
    usePlannerStore.setState({ tasks, snapshot: [base] });
    expect(usePlannerStore.getState().addManualTask({ title: "溢出", start: null, end: null, durationMin: 20, deadline: null, priority: 2, location: null, locked: false }).ok).toBe(false);
    expect(usePlannerStore.getState().tasks).toBe(tasks);
    expect(usePlannerStore.getState().snapshot).toEqual([base]);
  });
  it("批量新增超额时整批拒绝", () => {
    usePlannerStore.setState({ tasks: full().slice(1) });
    const draft = TaskDraftSchema.parse(base);
    expect(usePlannerStore.getState().addDrafts([draft, draft]).ok).toBe(false);
    expect(usePlannerStore.getState().tasks).toHaveLength(4999);
  });
  it("撤销快照同样拒绝重复id", () => {
    expect(migrateImportedPayload({ tasks: [base], snapshot: [base, base] }).ok).toBe(false);
  });
});
