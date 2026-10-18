import { z } from "zod";
import { TaskDraftSchema, TaskSchema } from "./task";
import { CoverageReportSchema } from "../completeness";
import { ReplanPlanSchema } from "../reflow";

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
  /**
   * 完整性校验报告：原文每一行有没有归属。
   * 这是「不许静默丢弃」的**硬证据**——服务端拿原文重算，不采信模型自述。
   */
  coverage: CoverageReportSchema,
});
export type ParseTasksSuccess = z.infer<typeof ParseTasksSuccessSchema>;

export const ParseTasksFailureSchema = z.object({
  ok: z.literal(false),
  mode: AiModeSchema,
  error: z.string(),
  issues: z.array(z.string()),
  timings: z.array(PhaseTimingSchema),
  /** 模型返回的原始文本：失败卡必须能摊开给人看（ARCHITECTURE §3 第 4 闸） */
  raw: z.string().optional(),
});
export type ParseTasksFailure = z.infer<typeof ParseTasksFailureSchema>;

export const ParseTasksResponseSchema = z.discriminatedUnion("ok", [
  ParseTasksSuccessSchema,
  ParseTasksFailureSchema,
]);
export type ParseTasksResponse = z.infer<typeof ParseTasksResponseSchema>;

/* ---------------- 图片 → 任务 ---------------- */

/**
 * 允许的图片类型。只收这三种：iPhone 默认 HEIC 浏览器不解码，
 * 前端会先转成 JPEG 再上传（转换失败时明确报错，不悄悄失败）。
 */
export const ALLOWED_IMAGE_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

/**
 * base64 data URL 的长度上限（字符数）。
 * 客户端会先把长边压到 1400px、JPEG 质量 0.8，正常截图约 200–600KB，
 * 留到 3.2MB 是给"用户坚持传原图"的情形兜底，同时防止请求体被打爆。
 */
export const MAX_IMAGE_DATA_URL_LENGTH = 3_200_000;

const IMAGE_DATA_URL_PREFIX_RE = /^data:(image\/(?:png|jpeg|webp));base64,/;

export const ParseImageRequestSchema = z.object({
  /** data:image/png;base64,... —— 客户端压缩后上传，服务端不再做解码 */
  imageDataUrl: z
    .string()
    .min(64, "图片内容为空")
    .max(MAX_IMAGE_DATA_URL_LENGTH, "图片太大，请压缩后再传（建议长边 ≤1400px）")
    .refine((value) => IMAGE_DATA_URL_PREFIX_RE.test(value), "只支持 PNG / JPEG / WebP 的 base64 data URL"),
  /** 客户端本地日期，模型据此换算"周三""下周一" */
  dayKey: z.string().regex(DAY_KEY_RE, "dayKey 必须是 YYYY-MM-DD"),
  /** 用户附带的半句话（可选）。有就比没有准，但没有也必须能跑 */
  hint: z.string().trim().max(500).optional(),
});
export type ParseImageRequest = z.infer<typeof ParseImageRequestSchema>;

/** 图片路径与文本路径共用同一个响应契约，前端只需一套渲染逻辑 */
export type ParseImageResponse = ParseTasksResponse;

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
  raw: z.string().optional(),
});
export type ReplanFailure = z.infer<typeof ReplanFailureSchema>;

export const ReplanResponseSchema = z.discriminatedUnion("ok", [
  ReplanSuccessSchema,
  ReplanFailureSchema,
]);
export type ReplanResponse = z.infer<typeof ReplanResponseSchema>;
