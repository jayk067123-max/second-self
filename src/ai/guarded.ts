import type { z } from "zod";
import { describeAiError, getClient, providerRequestOptions, type AiRuntimeConfig } from "./client";

/**
 * 结构化输出调用 —— 「四道闸」里的第 1~3 道：
 *   1. Schema First：调用方必须传入 zod 契约
 *   2. 强制 JSON + 硬校验：response_format=json_object + safeParse
 *   3. 分级修复重试：把 zod 的 issues 回灌给模型，只修 JSON
 */

export interface PhaseTiming {
  phase: string;
  ms: number;
}

export type StructuredResult<T> =
  | { ok: true; data: T; attempts: number; timings: PhaseTiming[] }
  | {
      ok: false;
      error: string;
      issues: string[];
      attempts: number;
      timings: PhaseTiming[];
      raw?: string;
    };

export interface StructuredCallOptions<T> {
  /** 输出契约；模型产物必须过这层校验 */
  schema: z.ZodType<T>;
  system: string;
  /** 第一次调用的 user 内容 */
  user: string;
  /**
   * 可选图片（data URL）。给了就走多模态消息：文本 + 图。
   * 图片路径与文本路径共用同一份契约与同一套重试逻辑 —— 差别只在消息体。
   */
  imageDataUrl?: string;
  /** 修复轮：把上一次的失败原因拼进 user 内容 */
  buildRepairUser: (issues: string[]) => string;
  config: AiRuntimeConfig;
  /** 输出 token 上限，防止某次调用把费用打爆 */
  maxOutputTokens?: number;
}

function now(): number {
  return Date.now();
}

/** 把 zod issues 压成"字段: 原因"的可读列表，既回灌模型也给用户看 */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 8).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(根)";
    return `${path}: ${issue.message}`;
  });
}

export async function callStructuredJson<T>(
  options: StructuredCallOptions<T>,
): Promise<StructuredResult<T>> {
  const { schema, config } = options;
  const attemptsAllowed = 1 + Math.max(0, config.maxRetries);
  const timings: PhaseTiming[] = [];
  let issues: string[] = [];
  let raw: string | undefined;

  if (config.mode !== "live") {
    return {
      ok: false,
      error: "当前是 demo 模式，未发起真实模型调用",
      issues: [],
      attempts: 0,
      timings,
    };
  }

  const client = getClient(config);

  for (let attempt = 1; attempt <= attemptsAllowed; attempt += 1) {
    const t0 = now();
    let content: string;
    try {
      const userContent = options.imageDataUrl
        ? [
            { type: "text" as const, text: attempt === 1 ? options.user : options.buildRepairUser(issues) },
            { type: "image_url" as const, image_url: { url: options.imageDataUrl, detail: "high" as const } },
          ]
        : attempt === 1
          ? options.user
          : options.buildRepairUser(issues);
      const completion = await client.chat.completions.create({
        model: config.model,
        temperature: attempt === 1 ? 0.2 : 0,
        max_tokens: options.maxOutputTokens ?? 2000,
        response_format: { type: "json_object" },
        ...providerRequestOptions(config),
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: userContent },
        ],
      });
      content = completion.choices[0]?.message?.content ?? "";
      timings.push({ phase: `模型调用 #${attempt}`, ms: now() - t0 });
    } catch (error) {
      timings.push({ phase: `模型调用 #${attempt}（失败）`, ms: now() - t0 });
      return {
        ok: false,
        error: describeAiError(error, config.timeoutMs),
        issues,
        attempts: attempt,
        timings,
      };
    }

    const tValidate = now();
    raw = content;
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(stripCodeFence(content));
    } catch {
      issues = ["返回内容不是合法 JSON（可能被解释性文字包裹）"];
      timings.push({ phase: `校验 #${attempt}`, ms: now() - tValidate });
      continue;
    }

    const result = schema.safeParse(parsedJson);
    timings.push({ phase: `校验 #${attempt}`, ms: now() - tValidate });
    if (result.success) {
      return { ok: true, data: result.data, attempts: attempt, timings };
    }
    issues = formatIssues(result.error);
  }

  return {
    ok: false,
    error: "模型连续返回了不符合契约的结构，已停止重试",
    issues,
    attempts: attemptsAllowed,
    timings,
    raw,
  };
}

/** 有些模型会把 JSON 包在 ```json 里，容错一层（但仍要求整体可解析） */
function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
}
