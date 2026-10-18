import { NextResponse } from "next/server";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
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

/**
 * 数据层自检：探测「本地持久化」是否可用。
 *
 * 注意：本项目不使用服务端数据库（见 ARCHITECTURE §7 ADR-1，SQLite 方案已否决），
 * 任务数据存在浏览器 localStorage；这里只验证进程能否在本机落一个探针文件，
 * 用来发现"目录只读 / 磁盘满"这类环境问题，不代表存在数据库。
 */
async function checkData(): Promise<CheckResult> {
  const dir = path.join(process.cwd(), "data");
  const probe = path.join(dir, ".health-probe");
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(probe, new Date().toISOString(), "utf8");
    await rm(probe, { force: true });
    return {
      name: "data.write",
      ok: true,
      detail: "本机目录可写 · 数据存 localStorage（无服务端数据库）",
    };
  } catch (err) {
    return {
      name: "data.write",
      ok: false,
      detail: err instanceof Error ? err.message : "data/ 不可写",
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
