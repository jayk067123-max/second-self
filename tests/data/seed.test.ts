import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adaptDemoSeed, isDemoSeed, seedTimeToIso } from "@/data/seed";
import { migrateImportedPayload } from "@/data/migrate";
import { DEFAULT_DETECT_CONFIG, detectConflicts } from "@/domain/conflicts";

/**
 * 演示种子转换的回归测试 —— 直接读选题官交付的 `docs/demo-fixtures/demo-seed.json`。
 * 这条测试的意义：**视频镜头②靠"导入 seed"进入冲突初始状态**，
 * 如果种子转不成 Task，镜头就拍不出来；而种子和 Task 契约的字段本来就不一样。
 */

const SEED_PATH = join(process.cwd(), "docs", "demo-fixtures", "demo-seed.json");
const seedRaw: unknown = JSON.parse(readFileSync(SEED_PATH, "utf8"));

describe("demo-seed 转换", () => {
  it("能识别出这是演示种子", () => {
    expect(isDemoSeed(seedRaw)).toBe(true);
  });

  it("转换成功后每条都符合 Task 契约", () => {
    const result = adaptDemoSeed(seedRaw);
    expect(result.ok, result.ok ? "" : result.error).toBe(true);
    if (!result.ok) return;
    expect(result.value.tasks.length).toBe(18);
  });

  it("种子人工设计的锁定/弹性信息一个都不丢", () => {
    const result = adaptDemoSeed(seedRaw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tasks.filter((t) => t.locked).length).toBe(9);
    expect(result.value.tasks.filter((t) => t.flexible).length).toBe(6);
    // 地点也要保留，否则冲突规则的"跨校区 60 分钟"没法生效
    expect(result.value.tasks.filter((t) => (t.location ?? null) !== null).length).toBeGreaterThan(0);
  });

  it("字符串优先级 high/medium/low 映射成 1/2/3", () => {
    const result = adaptDemoSeed(seedRaw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const task of result.value.tasks) {
      expect([1, 2, 3]).toContain(task.priority);
    }
  });

  it("date + HH:mm 合成 ISO，且 end 早于 start 时按跨天处理", () => {
    expect(seedTimeToIso("2026-10-19", "08:00")).toBe(new Date(2026, 9, 19, 8, 0, 0, 0).toISOString());
    const cross = seedTimeToIso("2026-10-19", "01:00", true);
    expect(new Date(cross).getDate()).toBe(20);
  });

  it("导入入口会自动走种子适配器（不需要用户先手工改格式）", () => {
    const result = migrateImportedPayload(seedRaw);
    expect(result.ok, result.ok ? "" : result.error).toBe(true);
    if (result.ok) expect(result.value.tasks).toHaveLength(18);
  });

  it("转换成 Task 后，本地冲突检测能复现种子里声明的重叠冲突", () => {
    const result = adaptDemoSeed(seedRaw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const demoNow = new Date("2026-10-19T09:00:00+08:00");
    const conflicts = detectConflicts(result.value.tasks, DEFAULT_DETECT_CONFIG, demoNow);
    const ids = conflicts.map((c) => c.conflictId);

    // 种子里写的是 overlap:t_defense+t_lab_meet，conflictId 由规则层按 prefix 生成
    expect(ids.some((id) => id.startsWith("overlap:") && id.includes("t_defense") && id.includes("t_lab_meet"))).toBe(true);
    expect(conflicts.length).toBeGreaterThan(0);
  });

  it("结构不合法时给出可读错误，而不是塞进空数据", () => {
    const result = adaptDemoSeed({ seedVersion: "v1", demoNow: "x", tasks: [{ id: "a" }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("演示种子结构不合法");
  });
  it("种子的日期与演示时钟不能使用不存在的日期", () => {
    const seed = seedRaw as { tasks: unknown[]; demoNow: string };
    expect(adaptDemoSeed({ ...seed, demoNow: "2026-02-30T09:00:00+08:00" }).ok).toBe(false);
    expect(adaptDemoSeed({ ...seed, tasks: [{ ...(seed.tasks[0] as object), date: "2026-02-30" }] }).ok).toBe(false);
  });
});
