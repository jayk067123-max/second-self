import { z } from "zod";

/**
 * 重排方案契约 —— 模型输出与本地裁决共用的唯一真源（ARCHITECTURE §3 第一道闸）。
 *
 * 关键设计：**两层 schema**。
 * - `AiProposalDraftSchema`：模型只能吐这个（label + ops，没有数字指标）。
 * - `ProposalSchema`：给用户看的那张卡，里面的冲突数/挪动条数/偏离分钟
 *   必须由本地校验器实算后填进来，模型无权填写。
 *
 * 为什么必须分开：如果让模型在同一个结构里既给方案又给"还剩几个冲突"，
 * 它一定会把数字写得很漂亮。契约层面就不给它这个机会，比事后校验更可靠。
 */

const isoString = z.string().min(1);
const taskIdField = z.string().min(1);

/** 移动：换个时间块，任务本身不变 */
export const MoveOpSchema = z.object({
  type: z.literal("move"),
  taskId: taskIdField,
  start: isoString,
  end: isoString,
});
export type MoveOp = z.infer<typeof MoveOpSchema>;

/** 调整时长：必须先看任务是否允许压缩（flexible） */
export const ResizeOpSchema = z.object({
  type: z.literal("resize"),
  taskId: taskIdField,
  start: isoString,
  end: isoString,
});
export type ResizeOp = z.infer<typeof ResizeOpSchema>;

/**
 * 新增时间块（例如自动补出的"前往活动室 40 分钟"准备时间）。
 * 模型不得指定 id：id 由本地按位置确定性生成，否则模型编出的 id 会
 * 和现有任务撞车，或者带上不可预期的前缀污染数据。
 * `durationMin` 也不由模型给 —— 一律由 start/end 本地推导，杜绝自相矛盾。
 */
export const AddOpSchema = z.object({
  type: z.literal("add"),
  taskId: taskIdField.optional(),
  title: z.string().trim().min(1).max(200),
  start: isoString,
  end: isoString,
  location: z.string().trim().max(60).nullable().optional(),
  priority: z.number().int().min(1).max(3).optional(),
  deadline: z.string().nullable().optional(),
});
export type AddOp = z.infer<typeof AddOpSchema>;

/** 删除：locked / 已完成的任务一律不允许被方案删掉 */
export const RemoveOpSchema = z.object({
  type: z.literal("remove"),
  taskId: taskIdField,
});
export type RemoveOp = z.infer<typeof RemoveOpSchema>;

export const ReflowOpSchema = z.discriminatedUnion("type", [
  MoveOpSchema,
  ResizeOpSchema,
  AddOpSchema,
  RemoveOpSchema,
]);
export type ReflowOp = z.infer<typeof ReflowOpSchema>;

/** 模型只能输出这个：一套方案 = 标签 + 动作清单 */
export const AiProposalDraftSchema = z.object({
  label: z.string().trim().min(1).max(20),
  ops: z.array(ReflowOpSchema).min(1).max(40),
});
export type AiProposalDraft = z.infer<typeof AiProposalDraftSchema>;

export const AiProposalOutputSchema = z.object({
  proposals: z.array(AiProposalDraftSchema).min(1).max(3),
});
export type AiProposalOutput = z.infer<typeof AiProposalOutputSchema>;

/**
 * 呈现给用户的方案卡片（SPEC B1）。
 * 所有数字字段都是本地实算的结论，`rejected` 只是调试信息，不进 UI 主区。
 */
export const ProposalSchema = z.object({
  id: z.string().min(1),
  /** 1 为推荐 */
  rank: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  label: z.string().trim().min(1).max(20),
  ops: z.array(ReflowOpSchema).min(1).max(40),
  conflictsBefore: z.number().int().min(0),
  conflictsAfter: z.number().int().min(0),
  movedCount: z.number().int().min(0),
  deviationMin: z.number().int().min(0),
  /** 必须恒为 0；非 0 的方案在裁决阶段就被作废，不会出现在这里 */
  lockedTouched: z.number().int().min(0),
  sacrifices: z.array(z.string().min(1).max(40)).max(6),
  rejected: z.array(z.object({ reason: z.string().min(1) })).optional(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

/** 作息窗口 + 判定阈值：方案裁决的全部外部参数（无全局状态、无环境变量） */
export const ReflowConfigSchema = z.object({
  /** 允许安排任务的起止分钟（07:00 = 420） */
  dayStartMin: z.number().int().min(0).max(24 * 60),
  dayEndMin: z.number().int().min(0).max(24 * 60),
});
export type ReflowConfig = z.infer<typeof ReflowConfigSchema>;

/* ─────────────────────────────────────────────────────────────
 * 旧「本地方案生成」契约
 *
 * 这组 schema 原来住在 `src/domain/planner.ts`。按 ARCHITECTURE §2 的目录口径，
 * `domain/` 下只有 conflicts / reflow / snapshot 三个算法文件，不存在 planner，
 * 所以这里连同生成器函数一起并入 reflow —— 它们本来就是"重排"这件事的两半：
 * 一半是本地兜底生成（没模型时也能出方案），一半是本地裁决（模型出的方案要过闸）。
 *
 * 契约放 schemas/、函数放 reflow.ts，与 Route/UI 的取用方式保持一致。
 * ───────────────────────────────────────────────────────────── */

/** 重排方案里的一个时间块 */
export const PlanBlockSchema = z.object({
  taskId: taskIdField,
  start: isoString,
  end: isoString,
});
export type PlanBlock = z.infer<typeof PlanBlockSchema>;

export const ReplanPlanSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(60),
  rationale: z.string().trim().min(1).max(400),
  blocks: z.array(PlanBlockSchema).min(1).max(40),
});
export type ReplanPlan = z.infer<typeof ReplanPlanSchema>;

/** 模型输出契约：不带 id（由服务端补），最多 3 套 */
export const AiReplanOutputSchema = z.object({
  plans: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(60),
        rationale: z.string().trim().min(1).max(400),
        blocks: z.array(PlanBlockSchema).min(1).max(40),
      }),
    )
    .min(2)
    .max(3),
});
export type AiReplanOutput = z.infer<typeof AiReplanOutputSchema>;

export const PlanOptionsSchema = z.object({
  bufferMin: z.number().int().min(0).max(120),
  dailyLimitMin: z.number().int().min(60).max(24 * 60),
  /** 作息窗口：当天允许安排任务的起止分钟 */
  dayStartMin: z.number().int().min(0).max(24 * 60),
  dayEndMin: z.number().int().min(0).max(24 * 60),
});
export type PlanOptions = z.infer<typeof PlanOptionsSchema>;
