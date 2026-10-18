import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/ai/parse-image/route";
import { resetRateLimit } from "@/ai/ratelimit";
import { MAX_IMAGE_DATA_URL_LENGTH } from "@/domain/schemas/api";

/**
 * 图片路由的入口校验 —— 便宜的一道闸：能在解包前拦下的，绝不进模型。
 * 这里只测「请求形状」，不测真实多模态调用（那需要密钥，且属于 live 模式的集成测试）。
 */

/** 1×1 PNG：长度够过 min(64) 的合法 base64 载荷 */
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/gGr2yQzAAAAAElFTkSuQmCC";

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/ai/parse-image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/ai/parse-image", () => {
  beforeEach(() => {
    resetRateLimit();
    delete process.env.LLM_API_KEY;
  });

  it("请求体不是 JSON → 400 且给可读原因", async () => {
    const response = await POST(
      new Request("http://localhost/api/ai/parse-image", { method: "POST", body: "{不是 JSON" }),
    );
    expect(response.status).toBe(400);
    const json = (await response.json()) as { error: string };
    expect(json.error).toContain("JSON");
  });

  it("非图片 data URL（例如 GIF）→ 400，不进模型", async () => {
    const response = await post({ imageDataUrl: `data:image/gif;base64,${"A".repeat(100)}`, dayKey: "2026-10-19" });
    expect(response.status).toBe(400);
    const json = (await response.json()) as { issues: string[] };
    expect(json.issues.join(" ")).toContain("PNG / JPEG / WebP");
  });

  it("超过长度上限 → 400，提示压缩", async () => {
    const response = await post({
      imageDataUrl: `data:image/png;base64,${"A".repeat(MAX_IMAGE_DATA_URL_LENGTH)}`,
      dayKey: "2026-10-19",
    });
    expect(response.status).toBe(400);
    const json = (await response.json()) as { issues: string[] };
    expect(json.issues.join(" ")).toContain("图片太大");
  });

  it("dayKey 格式不对 → 400", async () => {
    const response = await post({ imageDataUrl: TINY_PNG, dayKey: "2026/10/19" });
    expect(response.status).toBe(400);
  });

  it("合法请求 + demo 模式 → 422 诚实失败，而不是假任务", async () => {
    const response = await post({ imageDataUrl: TINY_PNG, dayKey: "2026-10-19" });
    expect(response.status).toBe(422);
    const json = (await response.json()) as { ok: boolean; mode: string; error: string };
    expect(json.ok).toBe(false);
    expect(json.mode).toBe("demo");
    expect(json.error).toContain("图片识别");
  });

  it("限流：每分钟最多 5 次，第 6 次拿到 429 与 retry-after", async () => {
    for (let i = 0; i < 5; i += 1) {
      const allowed = await post({ imageDataUrl: TINY_PNG, dayKey: "2026-10-19" });
      expect(allowed.status).toBe(422);
    }
    const blocked = await post({ imageDataUrl: TINY_PNG, dayKey: "2026-10-19" });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).not.toBeNull();
  });
});
