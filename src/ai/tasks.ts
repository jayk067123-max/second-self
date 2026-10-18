import {
  AiReplanOutputSchema,
  DEFAULT_PLAN_OPTIONS,
  validatePlan,
  type ReplanPlan,
} from "@/domain/reflow";
import {
  AiParseOutputSchema,
  TaskDraftSchema,
  type Task,
  type TaskDraft,
} from "@/domain/schemas/task";
import { checkCoverage, unverifiedCoverage } from "@/domain/completeness";
import type {
  ParseTasksResponse,
  ReplanResponse,
  RejectedPlan,
} from "@/domain/schemas/api";
import { readAiConfig, type AiRuntimeConfig } from "./client";
import { demoParseTasks, demoReplanPlans } from "./demo";
import { callStructuredJson } from "./guarded";
import {
  IMAGE_PARSE_SYSTEM,
  PARSE_TASKS_SYSTEM,
  REPLAN_SYSTEM,
  buildImageParseUser,
  buildParseUser,
  buildRepairUser,
  buildReplanUser,
} from "./prompts";

/**
 * AI 层的两个用例编排。上层（route handler）只负责校验入参和序列化。
 * 每个用例都返回 DTO 契约类型，成功/失败都是"可预期结构"，不抛异常。
 *
 * 三个用例：文本→任务、图片→任务、当日重排。
 * 前两个共用同一份输出契约与同一套逐条校验，差别只在消息体与完整性校验方式。
 */

/** 逐条再过一次 Draft 契约：模型可能某一条合法、另一条不合法 */
function validateDrafts(items: ReadonlyArray<unknown>): {
  kept: TaskDraft[];
  droppedIssues: string[];
} {
  const kept: TaskDraft[] = [];
  const droppedIssues: string[] = [];
  for (const [index, item] of items.entries()) {
    const parsed = TaskDraftSchema.safeParse(item);
    if (parsed.success) {
      kept.push(parsed.data);
    } else {
      const title =
        typeof item === "object" && item !== null && "title" in item
          ? String((item as { title: unknown }).title)
          : "(无标题)";
      droppedIssues.push(
        `第 ${index + 1} 条「${title}」字段不合法，已丢弃：${parsed.error.issues[0]?.message ?? "未知原因"}`,
      );
    }
  }
  return { kept, droppedIssues };
}

export async function parseTasksFromText(
  input: { text: string; dayKey: string },
  config: AiRuntimeConfig = readAiConfig(),
): Promise<ParseTasksResponse> {
  if (config.mode === "demo") {
    const tasks = demoParseTasks(input.text, input.dayKey);
    const parsed = TaskDraftSchema.array().safeParse(tasks);
    if (!parsed.success || parsed.data.length === 0) {
      return {
        ok: false,
        mode: "demo",
        error: "没从这段文本里识别出任何任务，试试写成一行一件事，例如「14:00-15:30 小组会议」",
        issues: [],
        timings: [{ phase: "本地规则解析", ms: 0 }],
      };
    }
    return {
      ok: true,
      mode: "demo",
      tasks: parsed.data,
      attempts: 0,
      timings: [{ phase: "本地规则解析", ms: 0 }],
      droppedIssues: [],
      // 规则版解析也照样核一遍原文：它同样会漏行
      coverage: checkCoverage(input.text, parsed.data),
    };
  }

  const user = buildParseUser(input.text, input.dayKey);
  const result = await callStructuredJson({
    schema: AiParseOutputSchema,
    system: PARSE_TASKS_SYSTEM,
    user,
    buildRepairUser: (issues) => buildRepairUser(user, issues),
    config,
  });

  if (!result.ok) {
    return {
      ok: false,
      mode: "live",
      error: result.error,
      issues: result.issues,
      timings: result.timings,
      raw: result.raw,
    };
  }

  const { kept, droppedIssues } = validateDrafts(result.data.tasks);

  if (kept.length === 0) {
    return {
      ok: false,
      mode: "live",
      error: "模型返回的条目全部未通过契约校验",
      issues: droppedIssues,
      timings: result.timings,
    };
  }

  return {
    ok: true,
    mode: "live",
    tasks: kept,
    attempts: result.attempts,
    timings: result.timings,
    droppedIssues,
    coverage: checkCoverage(input.text, kept),
  };
}

/**
 * 图片 → 任务。
 *
 * demo 模式**必须诚实失败**：没有密钥就没有多模态能力，任何"假装识别成功"的
 * 固定返回都会让用户以为图里的内容进去了，这是最坏的体验。所以这里返回可读错误，
 * 并明确指出去哪儿继续（粘贴文本 / 手动新增）。
 */
export async function parseTasksFromImage(
  input: { imageDataUrl: string; dayKey: string; hint?: string },
  config: AiRuntimeConfig = readAiConfig(),
): Promise<ParseTasksResponse> {
  if (config.mode === "demo") {
    return {
      ok: false,
      mode: "demo",
      error:
        "图片识别需要真实多模态模型，当前未配置 LLM_API_KEY（demo 模式）。请把图里的文字打一句话发我，或改用「粘贴文本」入口。",
      issues: ["demo 模式不提供图片识别：不会假装已经识别成功"],
      timings: [{ phase: "模式检查", ms: 0 }],
    };
  }

  const user = buildImageParseUser(input.dayKey, input.hint);
  const result = await callStructuredJson({
    schema: AiParseOutputSchema,
    system: IMAGE_PARSE_SYSTEM,
    user,
    imageDataUrl: input.imageDataUrl,
    buildRepairUser: (issues) => buildRepairUser(user, issues),
    config,
    maxOutputTokens: 3000,
  });

  if (!result.ok) {
    return {
      ok: false,
      mode: "live",
      error: result.error,
      issues: result.issues,
      timings: result.timings,
      raw: result.raw,
    };
  }

  const { kept, droppedIssues } = validateDrafts(result.data.tasks);

  if (kept.length === 0) {
    return {
      ok: false,
      mode: "live",
      error: "模型没能从这张图里取出可用的任务，换一张更清晰的图，或把内容打一句话发我",
      issues: droppedIssues,
      timings: result.timings,
    };
  }

  return {
    ok: true,
    mode: "live",
    tasks: kept,
    attempts: result.attempts,
    timings: result.timings,
    droppedIssues,
    // 图片路径没有可信原文：verified=false，前端不许显示"100% 已覆盖"
    coverage: unverifiedCoverage(kept),
  };
}

export async function replanForDay(
  input: { tasks: Task[]; dayKey: string },
  config: AiRuntimeConfig = readAiConfig(),
): Promise<ReplanResponse> {
  const schedulable = input.tasks.filter((t) => !t.done && t.durationMin > 0);
  if (schedulable.length === 0) {
    return {
      ok: false,
      mode: config.mode,
      error: "没有可重排的任务：需要至少一条未完成、且时长大於 0 分钟的任务",
      issues: [],
      timings: [],
    };
  }

  if (config.mode === "demo") {
    const plans = demoReplanPlans(input.tasks, input.dayKey);
    return finalizePlans(plans, input, "demo", [], false, [
      { phase: "本地确定性重排", ms: 0 },
    ]);
  }

  const user = buildReplanUser(input.dayKey, input.tasks);
  const result = await callStructuredJson({
    schema: AiReplanOutputSchema,
    system: REPLAN_SYSTEM,
    user,
    buildRepairUser: (issues) => buildRepairUser(user, issues),
    config,
    maxOutputTokens: 2500,
  });

  if (!result.ok) {
    return {
      ok: false,
      mode: "live",
      error: result.error,
      issues: result.issues,
      timings: result.timings,
      raw: result.raw,
    };
  }

  const rejected: RejectedPlan[] = [];
  const legal: ReplanPlan[] = [];
  for (const [index, rawPlan] of result.data.plans.entries()) {
    const plan: ReplanPlan = {
      id: `ai-plan-${index + 1}`,
      title: rawPlan.title,
      rationale: rawPlan.rationale,
      blocks: rawPlan.blocks,
    };
    const verdict = validatePlan(plan, input.tasks, input.dayKey, DEFAULT_PLAN_OPTIONS);
    if (verdict.ok) {
      legal.push(plan);
    } else {
      rejected.push({ title: plan.title, issues: verdict.issues });
    }
  }

  if (legal.length === 0) {
    // 模型方案全部不可落地：改用确定性兜底，并把否决理由如实回传
    const plans = demoReplanPlans(input.tasks, input.dayKey);
    return finalizePlans(plans, input, "live", rejected, true, result.timings);
  }

  return {
    ok: true,
    mode: "live",
    plans: legal,
    rejected,
    fallback: false,
    timings: result.timings,
  };
}

/** 兜底方案也再无解时，必须给出可读错误而不是空白 */
function finalizePlans(
  plans: ReplanPlan[],
  _input: { tasks: Task[]; dayKey: string },
  mode: "live" | "demo",
  rejected: RejectedPlan[],
  fallback: boolean,
  timings: Array<{ phase: string; ms: number }>,
): ReplanResponse {
  if (plans.length === 0) {
    return {
      ok: false,
      mode,
      error: "今天的剩余时间放不下任何一套方案，建议先减少任务或延长可用时段",
      issues: rejected.flatMap((r) => r.issues),
      timings,
    };
  }
  return { ok: true, mode, plans, rejected, fallback, timings };
}
