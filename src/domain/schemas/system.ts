import { z } from "zod";

/**
 * 自检报告契约 —— 服务端产出、客户端渲染都必须过这层 schema。
 * 这是「schema 先于实现」的最小示例：任何新增检查项先改这里，再改实现。
 */
export const LayerKeySchema = z.enum(["app", "ui", "domain", "data", "ai", "shared"]);
export type LayerKey = z.infer<typeof LayerKeySchema>;

export const LayerStatusSchema = z.object({
  key: LayerKeySchema,
  label: z.string().min(1),
  path: z.string().min(1),
  boundary: z.string().min(1),
  ready: z.boolean(),
  note: z.string(),
});
export type LayerStatus = z.infer<typeof LayerStatusSchema>;

export const CheckResultSchema = z.object({
  /** 稳定标识，用于 UI key 与日志检索 */
  name: z.string().min(1),
  ok: z.boolean(),
  detail: z.string(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

export const HealthReportSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  app: z.object({
    name: z.string(),
    version: z.string(),
    env: z.string(),
    node: z.string(),
  }),
  /** 模型能力当前所处的模式：live=真实调用，demo=无密钥的固定响应 */
  aiMode: z.enum(["live", "demo"]),
  layers: z.array(LayerStatusSchema),
  checks: z.array(CheckResultSchema),
  checkedAt: z.string(),
});
export type HealthReport = z.infer<typeof HealthReportSchema>;
