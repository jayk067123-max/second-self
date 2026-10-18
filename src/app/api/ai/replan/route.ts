import { NextResponse } from "next/server";
import { ReplanRequestSchema } from "@/domain/schemas/api";
import { replanForDay } from "@/ai/tasks";
import { checkRateLimit, clientKeyOf } from "@/ai/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/replan
 * 任务集合 → 2-3 套重排方案。模型只提方案，合法性由 domain 的 validatePlan 判定，
 * 被否决的方案连同原因一起返回（透明化）。
 */
export async function POST(request: Request) {
  const limit = checkRateLimit(`replan:${clientKeyOf(request)}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: `请求太频繁，请 ${limit.retryAfterSec} 秒后再试`, issues: [], timings: [] },
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

  const parsed = ReplanRequestSchema.safeParse(body);
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

  const result = await replanForDay(parsed.data);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
