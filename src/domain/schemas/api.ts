import { z } from "zod";
import { TaskDraftSchema, TaskSchema } from "./task";
import { ReplanPlanSchema } from "../planner";

/**
 * API DTO 契约 —— 服务端返回什么、客户端接受什么，都从这里取。
 * 客户端拿到响应后同样 safeParse 一次，不信任任何外部返回。
 */

export const AiModeSchema = z.enum(["live", "demo"]);
export type AiMode = z.infer<typeof AiModeSchema>;

export const PhaseTimingSchema = z.object({
  phase: z.string(),
  ms: z.number(),
});
export type PhaseTiming = z.infer<typeof PhaseTimingSchema>;

export const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ---------------- 文本 → 任务 ---------------- */

export const ParseTasksRequestSchema = z.object({
  /** 用户粘贴的原始文本（已经在客户端 trim） */
  text: z.string().trim().min(5, "至少输入 5 个字").max(8000, "一次最多 8000 字"),
  /** 客户端本地日期，模型据此换算"明天""周三" */
  dayKey: z.string().regex(DAY_KEY_RE, "dayKey 必须是 YYYY-MM-DD"),
});
export type ParseTasksRequest = z.infer<typeof ParseTasksRequestSchema>;

export const ParseTasksSuccessSchema = z.object({
  ok: z.literal(true),
  mode: AiModeSchema,
  tasks: z.array(TaskDraftSchema).min(1).max(60),
  attempts: z.number().int().min(0),
  timings: z.array(PhaseTimingSchema),
  /** 被契约拦下的条目说明（部分成功时给用户看） */
  droppedIssues: z.array(z.string()),
});
export type ParseTasksSuccess = z.infer<typeof ParseTasksSuccessSchema>;

export const ParseTasksFailureSchema = z.object({
  ok: z.literal(false),
  mode: AiModeSchema,
  error: z.string(),
  issues: z.array(z.string()),
  timings: z.array(PhaseTimingSchema),
});
export type ParseTasksFailure = z.infer<typeof ParseTasksFailureSchema>;

export const ParseTasksResponseSchema = z.discriminatedUnion("ok", [
  ParseTasksSuccessSchema,
  ParseTasksFailureSchema,
]);
export type ParseTasksResponse = z.infer<typeof ParseTasksResponseSchema>;

/* ---------------- 重排 ---------------- */

export const ReplanRequestSchema = z.object({
  tasks: z.array(TaskSchema).max(60),
  dayKey: z.string().regex(DAY_KEY_RE, "dayKey 必须是 YYYY-MM-DD"),
});
export type ReplanRequest = z.infer<typeof ReplanRequestSchema>;

export const RejectedPlanSchema = z.object({
  title: z.string(),
  issues: z.array(z.string()),
});
export type RejectedPlan = z.infer<typeof RejectedPlanSchema>;

export const ReplanSuccessSchema = z.object({
  ok: z.literal(true),
  mode: AiModeSchema,
  plans: z.array(ReplanPlanSchema).min(1).max(3),
  /** 被本地校验否决的方案及原因（透明化，给评委看"AI 没有被无脑信任"） */
  rejected: z.array(RejectedPlanSchema),
  /** true 表示模型方案全部被否决，已改用确定性兜底方案 */
  fallback: z.boolean(),
  timings: z.array(PhaseTimingSchema),
});
export type ReplanSuccess = z.infer<typeof ReplanSuccessSchema>;

export const ReplanFailureSchema = z.object({
  ok: z.literal(false),
  mode: AiModeSchema,
  error: z.string(),
  issues: z.array(z.string()),
  timings: z.array(PhaseTimingSchema),
});
export type ReplanFailure = z.infer<typeof ReplanFailureSchema>;

export const ReplanResponseSchema = z.discriminatedUnion("ok", [
  ReplanSuccessSchema,
  ReplanFailureSchema,
]);
export type ReplanResponse = z.infer<typeof ReplanResponseSchema>;
