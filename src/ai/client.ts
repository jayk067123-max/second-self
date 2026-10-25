import OpenAI from "openai";

/**
 * 模型运行配置 —— 全部来自服务端环境变量，密钥永远不进前端。
 * 未配置 LLM_API_KEY 时进入 demo 模式：不发起任何网络请求，
 * 由 src/ai/demo.ts 用确定性算法产出结构合法的结果，保证全链路可演示。
 */
export interface AiRuntimeConfig {
  mode: "live" | "demo";
  baseURL: string | undefined;
  apiKey: string | undefined;
  model: string;
  timeoutMs: number;
  /** 校验失败后允许的重试次数（不含首次） */
  maxRetries: number;
}

export function readAiConfig(env: NodeJS.ProcessEnv = process.env): AiRuntimeConfig {
  const apiKey = env.LLM_API_KEY?.trim();
  const timeoutMs = toPositiveInt(env.AI_REQUEST_TIMEOUT_MS, 30_000);
  return {
    mode: apiKey ? "live" : "demo",
    baseURL: env.LLM_BASE_URL?.trim() || undefined,
    apiKey: apiKey || undefined,
    model: env.LLM_MODEL?.trim() || "gpt-4o-mini",
    timeoutMs,
    maxRetries: Math.min(3, toPositiveInt(env.AI_MAX_RETRIES, 1)),
  };
}

/** 官方 DeepSeek 默认开启思考；字段提取关闭思考以保留 JSON 输出预算。 */
export function providerRequestOptions(config: AiRuntimeConfig): { thinking?: { type: "disabled" } } {
  try {
    if (config.baseURL && new URL(config.baseURL).hostname === "api.deepseek.com") {
      return { thinking: { type: "disabled" } };
    }
  } catch { /* 地址错误仍由请求层统一提示，不向其他服务发送专属参数。 */ }
  return {};
}

/** 单例客户端：避免每次请求都新建连接池 */
let cached: { key: string; client: OpenAI } | null = null;

export function getClient(config: AiRuntimeConfig): OpenAI {
  if (config.mode !== "live" || !config.apiKey) {
    throw new Error("demo 模式下不应创建真实客户端");
  }
  const key = `${config.baseURL ?? "default"}|${config.apiKey.slice(0, 6)}|${config.timeoutMs}`;
  if (cached?.key === key) return cached.client;
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: config.timeoutMs,
    maxRetries: 0, // 重试策略由 src/ai/guarded.ts 统一控制，便于记录失败原因
  });
  cached = { key, client };
  return client;
}

/** 把技术错误翻译成人话 —— 前端直接展示，不吐 stack trace */
export function describeAiError(error: unknown, timeoutMs: number): string {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401 || error.status === 403) return "模型密钥无效或没有权限，请检查 LLM_API_KEY";
    if (error.status === 404) return "模型接口地址不对，请检查 LLM_BASE_URL 与 LLM_MODEL";
    if (error.status === 429) return "模型服务限流了，等几秒再试";
    if (error.status && error.status >= 500) return "模型服务暂时不可用，稍后重试";
    return `模型接口返回错误（HTTP ${error.status ?? "未知"}）`;
  }
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return `模型响应超时（已等待 ${Math.round(timeoutMs / 1000)} 秒）`;
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return "连不上模型服务，请检查网络或 LLM_BASE_URL";
  }
  if (error instanceof Error) {
    if (error.message.includes("AbortError") || error.name === "AbortError") {
      return `模型响应超时（已等待 ${Math.round(timeoutMs / 1000)} 秒）`;
    }
    return "模型调用失败，请稍后重试";
  }
  return "模型调用失败，请稍后重试";
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
