import { type NextRequest, NextResponse } from "next/server";
import { accountFailure, readAccountJson, requireAccount, sameOrigin } from "@/server/account-http";
import { AccountError } from "@/server/accounts";
import { readAiConfig } from "@/ai/client";
import { ParseTasksRequestSchema } from "@/domain/schemas/api";
import { parseTasksFromText } from "@/ai/tasks";
import { checkRateLimit } from "@/ai/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/parse-tasks
 * 粘贴文本 → 结构化任务草稿。失败一律返回可读中文，不吐 stack trace。
 */
export async function POST(request: NextRequest) {
  let userId: string;
  try { sameOrigin(request); userId = requireAccount(request).user.id; }
  catch (error) { return accountFailure(error); }
  const mode = readAiConfig().mode;
  const limit = checkRateLimit(`parse:${userId}`);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        mode,
        error: `请求太频繁，请 ${limit.retryAfterSec} 秒后再试`,
        issues: [],
        timings: [],
      },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await readAccountJson(request, 64_000);
  } catch (error) {
    return NextResponse.json(
      { ok: false, mode, error: error instanceof AccountError ? error.message : "请求体不是合法 JSON", issues: [], timings: [] },
      { status: error instanceof AccountError ? error.status : 400 },
    );
  }

  const parsed = ParseTasksRequestSchema.safeParse(body);
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

  const result = await parseTasksFromText(parsed.data);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
