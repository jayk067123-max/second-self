import { NextResponse } from "next/server";
import { ParseImageRequestSchema } from "@/domain/schemas/api";
import { parseTasksFromImage } from "@/ai/tasks";
import { checkRateLimit, clientKeyOf } from "@/ai/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/parse-image
 * 截图/照片 → 结构化任务草稿。与 /api/ai/parse-tasks 共用同一份响应契约。
 *
 * 与文本路由的三点差别：
 *  1. 限流更紧（5 次/分钟）：一次多模态调用比一次文本调用贵一个量级；
 *  2. 图片是 base64 data URL，先按契约卡长度，不先做无谓的 JSON 大对象解析；
 *  3. demo 模式必须返回 422 + 可读原因，绝不用固定 mock 假装识别成功。
 */
export async function POST(request: Request) {
  const limit = checkRateLimit(`parse-image:${clientKeyOf(request)}`, 5);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: `图片识别每分钟最多 5 次，请 ${limit.retryAfterSec} 秒后再试`,
        issues: [],
        timings: [],
      },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "请求体不是合法 JSON", issues: [], timings: [] },
      { status: 400 },
    );
  }

  const parsed = ParseImageRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
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
