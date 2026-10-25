import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReplanRequestSchema, ReplanResponseSchema } from "@/domain/schemas/api";
import { TaskSchema } from "@/domain/schemas/task";
import { buildReplanUser } from "@/ai/prompts";
import { replanForDay } from "@/ai/tasks";
import { readAiConfig } from "@/ai/client";

const create = vi.hoisted(() => vi.fn());
vi.mock("@/ai/client", async importOriginal => {
  const actual = await importOriginal<typeof import("@/ai/client")>();
  return { ...actual, getClient: () => ({ chat: { completions: { create } } }) };
});
const task = TaskSchema.parse({ id: "move", title: "实验报告", start: "2026-10-28T14:00:00+08:00", end: "2026-10-28T15:00:00+08:00", durationMin: 60, deadline: null, priority: 2, source: "manual", done: false, rawTextOrigin: null, location: "图书馆", locked: false, repeat: null, needsReview: false });
const tasks = [{ ...task, id: "fixed", title: "固定课程", locked: true }, task];
const input = { tasks, dayKey: "2026-10-28", now: "2026-10-25T16:00:00+08:00" };
const config = { ...readAiConfig({ NODE_ENV: "test", LLM_API_KEY: "test-only" }), maxRetries: 1 };
const plan = (hour: number) => ({ title: "晚间安排", rationale: "已将实验报告移到晚饭后。", blocks: [{ taskId: "move", start: "2026-10-28T" + String(hour).padStart(2,"0") + ":00:00+08:00", end: "2026-10-28T" + String(hour+1).padStart(2,"0") + ":00:00+08:00" }] });
const response = (hour: number) => ({ choices: [{ message: { content: JSON.stringify({ plans: [plan(hour), plan(hour)] }) } }] });

describe("重排补充与约束修复", () => {
  beforeEach(() => create.mockReset());
  it("兼容原请求，补充去空格且限制长度", () => {
    expect(ReplanRequestSchema.safeParse(input).success).toBe(true);
    expect(ReplanRequestSchema.parse({ ...input, feedback: "  晚饭后再写  " }).feedback).toBe("晚饭后再写");
    expect(ReplanRequestSchema.safeParse({ ...input, feedback: "字".repeat(1001) }).success).toBe(false);
    expect(ReplanRequestSchema.safeParse({ ...input, previousPlan: { title: "空" } }).success).toBe(false);
  });
  it("当前时刻、完成标记、补充和上一方案进入上下文", () => {
    const prompt = buildReplanUser(input.dayKey, [{ ...task, done: true }], { now: input.now, feedback: "晚饭后再写", previousPlan: { ...plan(19), id: "previous" }, constraints: { bufferMin: 30 } });
    expect(prompt).toContain(input.now); expect(prompt).toContain("晚饭后再写");
    expect(prompt).toContain('"previousPlan"'); expect(prompt).toContain('"bufferMin":30');
    expect(prompt).toContain('已完成的任务ID：["move"]');
  });
  it("AI收到补充和上一方案，候选仍过护栏", async () => {
    create.mockResolvedValueOnce(response(19));
    const result = await replanForDay({ ...input, feedback: "晚饭后再写", previousPlan: { ...plan(9), id: "old" } }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe("live"); expect(result.fallback).toBe(false);
    expect(create.mock.calls[0]![0].messages[1].content).toContain("晚饭后再写");
    expect(result.plans[0]!.blocks[0]!.start).toContain("T19:");
    expect(ReplanResponseSchema.safeParse(result).success).toBe(true);
    expect(task.start).toContain("T14:");
  });
  it("全体业务约束失败会回灌原因，有界重试后通过", async () => {
    const invalid = response(19);
    invalid.choices[0]!.message.content = JSON.stringify({ plans: [plan(19), plan(19)].map(p => ({ ...p, blocks: p.blocks.map(b => ({ ...b, start: "2026-10-24T19:00:00+08:00", end: "2026-10-24T20:00:00+08:00" })) })) });
    create.mockResolvedValueOnce(invalid).mockResolvedValueOnce(response(19));
    const result = await replanForDay(input, config);
    expect(result.ok).toBe(true); expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]![0].messages[1].content).toContain("不能把任务排入已过去的时间");
  });
  it("无模型时不假称本地算法理解了补充", async () => {
    const result = await replanForDay({ ...input, feedback: "晚饭后再写" }, { ...config, mode: "demo" });
    expect(result.ok).toBe(false); expect(create).not.toHaveBeenCalled();
    if (!result.ok) expect(result.error).toContain("需要AI服务");
  });
  it("补充仍不可行时不返回忽略补充的本地方案", async () => {
    create.mockResolvedValue(response(6));
    const result = await replanForDay({ ...input, feedback: "安排凌晨6点" }, config);
    expect(result.ok).toBe(false); expect(create).toHaveBeenCalledTimes(2);
    if (!result.ok) expect(result.error).toContain("原方案已保留");
  });
  it("普通生成失败后仍可诚实回退本地", async () => {
    create.mockResolvedValue(response(6));
    const result = await replanForDay(input, config);
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.fallback).toBe(true); expect(result.rejected.length).toBeGreaterThan(0); }
  });
});
