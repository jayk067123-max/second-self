import { z } from "zod";
import { TaskSchema, type Task } from "@/domain/schemas/task";
import type { PlannerPayload, Result } from "./storage";

/**
 * 演示种子适配器 —— `docs/demo-fixtures/demo-seed.json` 不是 Task 契约的形状
 * （它用 `date + "08:00"` 表示时间、`priority: "medium"` 是字符串、`status: "todo"` 表示完成态），
 * 所以**不能直接导入**。这里做一次显式转换，好处有三：
 *   1. 种子里的人工设计值（locked / flexible / location）原样保留，一个不丢；
 *   2. 转换逻辑集中在一处，有单测，评审能看出"不是硬塞进去的"；
 *   3. 种子文件保持人类可读，不用为了导入而改成 ISO 字符串。
 *
 * 注意：这不是"猜着修数据"——种子是自家格式，有 seedVersion 标识，识别失败一律报错。
 */

export const SEED_VERSION = "v1";

const PriorityTextSchema = z.enum(["high", "medium", "low"]);

export const SeedTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  /** YYYY-MM-DD（本地时区）；纯 DDL 任务没有具体日期，为 null */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  /** HH:mm 或 null（纯 DDL 任务） */
  start: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  end: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  durationMin: z.number().int().min(0),
  deadline: z.string().nullable(),
  /** 种子里是 high/medium/low，落库要换成 1/2/3 */
  priority: z.union([PriorityTextSchema, z.number().int().min(1).max(3)]),
  location: z.string().nullable().optional(),
  locked: z.boolean().optional(),
  flexible: z.boolean().optional(),
  status: z.enum(["todo", "done"]).optional(),
});

export const DemoSeedSchema = z.object({
  seedVersion: z.literal(SEED_VERSION),
  demoNow: z.string(),
  timezone: z.string().optional(),
  tasks: z.array(SeedTaskSchema).min(1),
});

export type SeedTask = z.infer<typeof SeedTaskSchema>;

/** 是不是我们的演示种子（先认格式，再谈解析） */
export function isDemoSeed(raw: unknown): boolean {
  return (
    typeof raw === "object" &&
    raw !== null &&
    "seedVersion" in raw &&
    Array.isArray((raw as { tasks?: unknown }).tasks)
  );
}

const PRIORITY_MAP: Record<"high" | "medium" | "low", 1 | 2 | 3> = {
  high: 1,
  medium: 2,
  low: 3,
};

/** `2026-10-19` + `08:00` → 本地时区 ISO；end 早于 start 视为跨天，顺延一天 */
export function seedTimeToIso(date: string, time: string, crossesMidnight = false): string {
  const [y, m, d] = date.split("-").map((part) => Number.parseInt(part, 10));
  const [hh, mm] = time.split(":").map((part) => Number.parseInt(part, 10));
  const ms = new Date(
    y ?? 1970,
    (m ?? 1) - 1,
    (d ?? 1) + (crossesMidnight ? 1 : 0),
    hh ?? 0,
    mm ?? 0,
    0,
    0,
  ).getTime();
  return new Date(ms).toISOString();
}

export function adaptDemoSeed(raw: unknown): Result<PlannerPayload> {
  const parsed = DemoSeedSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: `演示种子结构不合法：${first?.path.join(".") || "(根)"} ${first?.message ?? ""}`.trim(),
    };
  }

  const tasks: Task[] = [];
  for (const seed of parsed.data.tasks) {
    const hasTime = seed.start !== null && seed.end !== null;
    // 时间段必须有日期才谈得上"排布"；只有截止日的任务 date 允许为 null
    if (hasTime && seed.date === null) {
      return {
        ok: false,
        error: `演示种子里的「${seed.title}」写了时段却没有日期，无法定位`,
      };
    }
    const hasBlock = hasTime && seed.date !== null;
    const crossesMidnight = hasBlock && seed.end! < seed.start!;
    const start = hasBlock ? seedTimeToIso(seed.date!, seed.start!) : null;
    const end = hasBlock ? seedTimeToIso(seed.date!, seed.end!, crossesMidnight) : null;
    const priority =
      typeof seed.priority === "number" ? seed.priority : PRIORITY_MAP[seed.priority];

    const candidate = {
      id: seed.id,
      title: seed.title,
      start,
      end,
      durationMin: seed.durationMin,
      deadline: seed.deadline,
      priority,
      source: "manual" as const,
      done: seed.status === "done",
      rawTextOrigin: null,
      location: seed.location ?? null,
      locked: seed.locked ?? false,
      flexible: seed.flexible ?? false,
      repeat: null,
      needsReview: false,
    };

    const checked = TaskSchema.safeParse(candidate);
    if (!checked.success) {
      return {
        ok: false,
        error: `演示种子里的「${seed.title}」不符合 Task 契约：${checked.error.issues[0]?.message ?? "未知原因"}`,
      };
    }
    tasks.push(checked.data);
  }

  return { ok: true, value: { tasks, snapshot: null } };
}
