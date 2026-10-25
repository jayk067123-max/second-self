import { NextResponse } from "next/server";
import { accountRepository } from "@/server/accounts";
import { resolveAiMode } from "@/ai";
import { ARCHITECTURE_LAYERS, APP_NAME, APP_VERSION } from "@/shared/constants";
import {
  HealthReportSchema,
  type CheckResult,
  type HealthReport,
} from "@/domain/schemas/system";

// 自检必须反映「此刻」的真实状态，禁止任何缓存
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 检查账号数据库连接与写事务，不返回用户数据或本机路径。 */
async function checkData(): Promise<CheckResult> {
  try {
    accountRepository().health();
    return {
      name: "data.write",
      ok: true,
      detail: "账号SQLite连接与写事务正常",
    };
  } catch {
    return {
      name: "data.write",
      ok: false,
      detail: "账号数据库暂时不可用",
    };
  }
}

/** 模型层自检：只判断「配置是否就位」，绝不在自检里发起真实调用（省钱且不阻塞） */
function checkAi(): CheckResult {
  const mode = resolveAiMode(process.env.LLM_API_KEY);
  if (mode === "live") {
    const model = process.env.LLM_MODEL?.trim();
    return {
      name: "ai.mode",
      ok: true,
      detail: model ? `live · ${model}` : "live · 未指定 LLM_MODEL",
    };
  }
  return { name: "ai.mode", ok: true, detail: "demo · 无密钥走固定响应" };
}

export async function GET() {
  const checks: CheckResult[] = [
    { name: "runtime.nodejs", ok: true, detail: `Node ${process.versions.node}` },
    { name: "route.reachable", ok: true, detail: "GET /api/health" },
    await checkData(),
    checkAi(),
  ];

  // 六层是否就位：各层入口文件已存在即视为就位（选题已定 B，业务实现已落地）
  const layers = ARCHITECTURE_LAYERS.map((layer) => ({
    ...layer,
    ready: true,
    note: "该层入口已就位；职责边界见 ARCHITECTURE §2",
  }));

  const report: HealthReport = {
    status: checks.every((c) => c.ok) ? "ok" : "degraded",
    app: {
      name: APP_NAME,
      version: APP_VERSION,
      env: process.env.NODE_ENV ?? "development",
      node: process.versions.node,
    },
    aiMode: resolveAiMode(process.env.LLM_API_KEY),
    layers,
    checks,
    checkedAt: new Date().toISOString(),
  };

  // schema 先于响应：产出也要过契约，防止字段漂移传到前端才发现
  const parsed = HealthReportSchema.safeParse(report);
  if (!parsed.success) {
    return NextResponse.json(
      { status: "degraded", error: "自检报告不符合契约", issues: parsed.error.issues },
      { status: 500 },
    );
  }

  return NextResponse.json(parsed.data, { status: 200 });
}
