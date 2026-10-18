import {
  EMPTY_PAYLOAD,
  PlannerPayloadSchema,
  type PlannerPayload,
  type Result,
} from "./storage";

/**
 * 数据版本迁移 —— 读取第三方/历史 JSON 时唯一的入口。
 *
 * 原则：宁可报错让用户重导，也不猜着修数据。
 * 只做**结构**层面的已知升级，不臆造字段内容。
 */

/** localStorage 里的历史形状 → 当前形状 */
export function migrateStoredPayload(raw: unknown): Result<PlannerPayload> {
  if (raw === null || raw === undefined) return { ok: true, value: EMPTY_PAYLOAD };

  // v1：直接就是 tasks 数组
  if (Array.isArray(raw)) {
    return validate({ tasks: raw, snapshot: null });
  }

  if (typeof raw !== "object") {
    return { ok: false, error: "本地数据不是对象或数组，已忽略" };
  }

  const record = raw as Record<string, unknown>;

  // 有些 zustand 版本会把 { state, version } 写进 storage，这里兼容一层
  const inner =
    record.state !== undefined && typeof record.state === "object" && record.state !== null
      ? (record.state as Record<string, unknown>)
      : record;

  if (inner.tasks === undefined) {
    return { ok: false, error: "本地数据里没有 tasks 字段，已忽略" };
  }

  return validate({ tasks: inner.tasks, snapshot: inner.snapshot ?? null });
}

/** 导入的 JSON 文本 → 当前形状（含信封校验与版本判断） */
export function migrateImportedPayload(parsed: unknown): Result<PlannerPayload> {
  if (parsed === null || typeof parsed !== "object") {
    return { ok: false, error: "导入内容不是 JSON 对象" };
  }
  const record = parsed as Record<string, unknown>;

  // 带信封的导出文件
  if (record.format !== undefined || record.data !== undefined) {
    if (record.format !== "vibe-coding-2026/planner") {
      return { ok: false, error: "这不是本工具导出的文件（format 不匹配）" };
    }
    const version = typeof record.version === "number" ? record.version : 0;
    if (version < 1) return { ok: false, error: "导入文件缺少有效版本号" };
    if (version > 2) {
      return {
        ok: false,
        error: `导入文件版本 v${version} 比当前程序（v2）新，请先升级再导入`,
      };
    }
    return validate(record.data);
  }

  // 兼容裸 tasks 数组的旧文件
  return migrateStoredPayload(parsed);
}

function validate(candidate: unknown): Result<PlannerPayload> {
  const parsed = PlannerPayloadSchema.safeParse(candidate);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join(".") || "(根)";
    return { ok: false, error: `数据结构不合法：${path} ${first?.message ?? ""}`.trim() };
  }
  return { ok: true, value: parsed.data };
}
