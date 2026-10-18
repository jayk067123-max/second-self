import { z } from "zod";
import { TaskListSchema } from "./task";

/**
 * 快照契约（SPEC B6）。
 *
 * 为什么快照存的是**整份** tasksState 而不是"一条变更记录"：
 * 回滚如果靠反向 op 回放，等于要求每一类操作都写一个正确的逆操作，
 * 一旦某类操作（新增、缩水、跨天切分）的逆操作写错，用户回滚后数据就是坏的。
 * 整份替换把这个问题从"每个 op 都要对"降成"一个赋值要对"，这是一次性成本。
 */

/** 快照来源：手改 / 解析落地 / 回滚本身 / 第 n 套方案 */
export const SNAPSHOT_SOURCE_PATTERN = /^(manual|parse|rollback|proposal#\d+)$/;

export const SnapshotSourceSchema = z.string().regex(SNAPSHOT_SOURCE_PATTERN);
export type SnapshotSource = z.infer<typeof SnapshotSourceSchema>;

/** 栈上限 20：超出丢最旧。P0 不做跨会话持久化的历史 */
export const SNAPSHOT_STACK_LIMIT = 20;

export const SnapshotSchema = z.object({
  snapshotId: z.string().min(1),
  parentSnapshotId: z.string().min(1).nullable(),
  /** ISO 时间，由调用方注入的 at 生成 */
  at: z.string().min(1),
  source: SnapshotSourceSchema,
  /** 一行摘要：'应用「最小改动」：挪 3 条' */
  opSummary: z.string().trim().min(1).max(60),
  /** 整体快照，不做反向 op */
  tasksState: TaskListSchema,
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

export const SnapshotStackSchema = z.object({
  entries: z.array(SnapshotSchema).max(SNAPSHOT_STACK_LIMIT),
  /** 当前所在版本（历史面板高亮项） */
  currentId: z.string().min(1).nullable(),
  /** 单调序号：snapshotId 由它生成，避免用随机数（domain 内禁止 Math.random） */
  seq: z.number().int().min(0),
  /**
   * 与快照栈**同步过**的任务状态。
   * 它和当前任务的差异，就是"用户在上次快照之后手动改过的东西"——
   * 回滚前必须据此二次确认，否则会静默吞掉用户刚敲的那几处修改。
   */
  syncedState: TaskListSchema.nullable(),
});
export type SnapshotStack = z.infer<typeof SnapshotStackSchema>;
