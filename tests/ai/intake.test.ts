import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTasksFromImage, parseTasksFromText } from "@/ai/tasks";
import { readAiConfig } from "@/ai/client";
import { ParseTasksResponseSchema } from "@/domain/schemas/api";
import { demoParseTasks } from "@/ai/demo";

/**
 * 完整性校验的**真实素材回归**：用选题官冻结的 notice.txt，
 * 断言"漏掉的那一行必须被报出来"，而不是只测人造字符串。
 *
 * 同时守住图片路径的底线：demo 模式必须诚实失败，不许返回固定 mock 假装识别成功。
 */

const FIXTURE_DIR = join(process.cwd(), "docs", "demo-fixtures");
const DAY = "2026-10-19";
const NOTICE = readFileSync(join(FIXTURE_DIR, "notice.txt"), "utf8");

const demoConfig = { ...readAiConfig({ NODE_ENV: "test" }), mode: "demo" as const, apiKey: undefined };

describe("完整性校验 · 真实素材 notice.txt", () => {
  it("8 行原文 → 7 条任务，剩下 1 行进「待确认」而不是消失", async () => {
    const result = await parseTasksFromText({ text: NOTICE, dayKey: DAY }, demoConfig);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.tasks).toHaveLength(7);
    expect(result.coverage.verified).toBe(true);
    expect(result.coverage.totalLines).toBe(8);
    expect(result.coverage.coveredCount).toBe(7);
    expect(result.coverage.uncovered).toHaveLength(1);
    expect(result.coverage.uncovered[0]?.text).toContain("@全体成员");
    expect(result.coverage.needsConfirm).toBe(true);
  });

  it("每一行原文都有去向：覆盖 + 上下文 + 待确认 = 总行数（没有静默丢弃）", async () => {
    const result = await parseTasksFromText({ text: NOTICE, dayKey: DAY }, demoConfig);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { coveredCount, contextLines, uncovered, totalLines } = result.coverage;
    expect(coveredCount + contextLines.length + uncovered.length).toBe(totalLines);
    // 待确认的每一行都必须真实存在于原文（不许编造行号或内容）
    for (const line of uncovered) {
      expect(NOTICE.split(/\r?\n/)[line.lineNo - 1]).toBe(line.text);
    }
  });

  it("返回体整体符合 API 契约（前端 safeParse 能直接吃下）", async () => {
    const result = await parseTasksFromText({ text: NOTICE, dayKey: DAY }, demoConfig);
    const parsed = ParseTasksResponseSchema.safeParse(result);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("同一素材两次解析：覆盖率报告逐字段相同（可复现）", async () => {
    const a = await parseTasksFromText({ text: NOTICE, dayKey: DAY }, demoConfig);
    const b = await parseTasksFromText({ text: NOTICE, dayKey: DAY }, demoConfig);
    expect(a).toEqual(b);
  });

  it("纯时间表文本：一行不漏，覆盖率 100%", async () => {
    const text = "9:00-10:30 高等数学\n14:00-15:00 小组会议";
    const result = await parseTasksFromText({ text, dayKey: DAY }, demoConfig);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.coverage.uncovered).toEqual([]);
    expect(result.coverage.ratio).toBe(1);
  });
});

describe("规则版解析器 · 群消息抬头不是任务", () => {
  it("「@全体成员 提醒几件事」不产出任务（但会被完整性校验报出来）", () => {
    const drafts = demoParseTasks("@全体成员 提醒几件事\n14:00-15:00 小组会议", DAY);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.title).toContain("小组会议");
  });

  it("抬头行里有时间就照样是任务（不许误杀）", () => {
    const drafts = demoParseTasks("@全体成员 明天下午3点开班会", DAY);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.start).not.toBeNull();
  });
});

describe("图片路径 · demo 模式必须诚实失败", () => {
  it("返回 ok:false 且说清楚为什么，不返回假任务", async () => {
    const result = await parseTasksFromImage(
      { imageDataUrl: "data:image/png;base64,AAAA", dayKey: DAY },
      demoConfig,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.mode).toBe("demo");
    expect(result.error).toContain("图片识别");
    expect(result.error).toContain("LLM_API_KEY");
    expect(result.issues[0]).toContain("不会假装");
  });
});
