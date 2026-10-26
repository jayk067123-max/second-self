import { type NextRequest, NextResponse } from "next/server";
import { accountFailure, readAccountJson, requireAccount, sameOrigin } from "@/server/account-http";
import { AccountError } from "@/server/accounts";
import { readAiConfig } from "@/ai/client";
import { ParseImageRequestSchema } from "@/domain/schemas/api";
import { parseTasksFromImage } from "@/ai/tasks";
import { checkRateLimit } from "@/ai/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/parse-image
 * 截图/照片 → 结构化任务草稿。与 /api/ai/parse-tasks 共用同一份响应契约。
 *
 * 与文本路由的三点差别：
 *  1. 限流更紧（5 次/分钟）：一次多模态调用比一次文本调用贵一个量级；
 *  2. 图片是 base64 data URL，先按字节限制流量，再解析 JSON 和校验字段；
 *  3. demo 模式必须返回 422 + 可读原因，绝不用固定 mock 假装识别成功。
 */
export async function POST(request: NextRequest) {
  let userId: string;
  try { sameOrigin(request); userId = requireAccount(request).user.id; }
  catch (error) { return accountFailure(error); }
  const mode = readAiConfig().mode;
  const limit = checkRateLimit(`parse-image:${userId}`, 5);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        mode,
        error: `图片识别每分钟最多 5 次，请 ${limit.retryAfterSec} 秒后再试`,
        issues: [],
        timings: [],
      },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await readAccountJson(request, 3_210_000);
  } catch (error) {
    return NextResponse.json(
      { ok: false, mode, error: error instanceof AccountError ? error.message : "请求体不是合法 JSON", issues: [], timings: [] },
      { status: error instanceof AccountError ? error.status : 400 },
    );
  }

  const parsed = ParseImageRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        mode,
        error: "请求参数不合法",
        issues: parsed.error.issues.map((i) => `${i.path.join(".") || "(根)"}: ${i.message}`),
        timings: [],
      },
      { status: 400 },
    );
  }

  const result = await parseTasksFromImage(parsed.data);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
