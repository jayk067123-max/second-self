import { describe, expect, it } from "vitest";
import { providerRequestOptions, readAiConfig } from "@/ai/client";

describe("服务商请求参数隔离", () => {
  it.each(["https://api.deepseek.com", "https://api.deepseek.com/v1"])("官方接口 %s 关闭思考并保留JSON预算", baseURL => {
    expect(providerRequestOptions(readAiConfig({ NODE_ENV: "test", LLM_BASE_URL: baseURL }))).toEqual({ thinking: { type: "disabled" } });
  });
  it.each([undefined, "https://api.openai.com/v1", "https://api.deepseek.com.example.org", "not a url"])("其他接口 %s 不携带专属参数", baseURL => {
    expect(providerRequestOptions(readAiConfig({ NODE_ENV: "test", LLM_BASE_URL: baseURL }))).toEqual({});
  });
});
