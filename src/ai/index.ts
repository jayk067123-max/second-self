/**
 * AI 编排层（占位）—— 骨架阶段只声明契约与降级规则，不发起真实调用。
 *
 * 四道闸（骨架第 5 步落地）：
 *   1. Schema First：先有 zod 契约，再由契约生成注入 prompt 的 JSON 结构描述
 *   2. 强制 JSON + schema.safeParse 硬校验
 *   3. 分级修复重试（回灌 issues → 降温拆任务 → 熔断并返回失败态 ok:false）
 *   4. 前端可视修复入口（原始输出/失败字段/一键重试），禁止静默吞错
 *
 * 密钥规则：只读 process.env 的 server 变量，绝不出现在 NEXT_PUBLIC_* 中。
 */
export const AI_LAYER_READY = true;

/** 未配置 LLM_API_KEY 时进入 demo 模式：返回结构合法的固定响应，保证全链路可演示 */
export function resolveAiMode(apiKey: string | undefined): "live" | "demo" {
  return apiKey && apiKey.trim().length > 0 ? "live" : "demo";
}
