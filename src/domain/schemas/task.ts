import { z } from "zod";

/**
 * Task 实体契约 —— 全系统唯一的任务定义。
 * 写入（store / API / 修正表）之前都必须过这层 schema。
 *
 * 说明：这里刻意写成显式字段而不是 omit/pick 拼接 ——
 * 契约是给别人读的，可读性优先于少写几行。
 */
export const TaskSourceSchema = z.enum(["text", "manual"]);
export type TaskSource = z.infer<typeof TaskSourceSchema>;

export const PRIORITY_LABEL: Record<1 | 2 | 3, string> = {
  1: "紧急",
  2: "常规",
  3: "弹性",
};

/**
 * 优先级三档映射。
 * 为什么要有这层映射：SPEC 用 'high'|'medium'|'low' 描述提前预警窗口，
 * 而落库的 Task 用 1/2/3 数字（数字好排序、好持久化）。
 * 两套话术必须在一个地方对上，否则规则4的 leadHours 会各写一份、迟早漂移。
 */
export type PriorityBand = "high" | "medium" | "low";

export const PRIORITY_BAND: Record<1 | 2 | 3, PriorityBand> = {
  1: "high",
  2: "medium",
  3: "low",
};

const isoOrNull = z.string().nullable();
const minutesField = z.number().int().min(0).max(24 * 60);
const priorityField = z.number().int().min(1).max(3);

/** 时间块合法性：要么都没有，要么成对且结束不早于开始 */
function refineTimeBlock(
  value: { start: string | null; end: string | null },
  ctx: z.RefinementCtx,
): void {
  if (value.start === null && value.end === null) return;
  if (value.start === null || value.end === null) {
    ctx.addIssue({
      code: "custom",
      message: "时间块的开始与结束必须成对出现",
      path: ["end"],
    });
    return;
  }
  const start = Date.parse(value.start);
  const end = Date.parse(value.end);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    ctx.addIssue({ code: "custom", message: "时间不是合法的时间戳", path: ["start"] });
    return;
  }
  if (end < start) {
    ctx.addIssue({ code: "custom", message: "结束时间不能早于开始时间", path: ["end"] });
  }
}

export const TaskSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1).max(200),
    /** ISO 字符串；纯 DDL 任务没有时间块时为 null */
    start: isoOrNull,
    end: isoOrNull,
    /** 分钟；0 表示只有截止时间、不占用时段 */
    durationMin: minutesField,
    /** ISO 字符串；无截止时间时为 null */
    deadline: isoOrNull,
    priority: priorityField,
    source: TaskSourceSchema,
    done: z.boolean(),
    /** 来自粘贴文本的原始行，用于人工修正时溯源 */
    rawTextOrigin: z.string().max(2000).nullable(),
    /**
     * 以下 6 个字段是 SPEC 冲突规则需要的约束信息，全部可选：
     * 缺省即"不知道"，规则里按"不知道"降档处理，绝不替用户编造。
     * 加可选而不是加必填，是为了不破坏已落库的旧数据与既有调用方。
     */
    /** 地点（'教室A' / '市区鼓楼'…）；null = 未知，缓冲规则会降为灰点 */
    location: z.string().trim().max(60).nullable().optional(),
    /** true = 固定块（课表/排班），重排不得移动 */
    locked: z.boolean().optional(),
    /** true = 可顺延/可压缩 */
    flexible: z.boolean().optional(),
    /** 同一父任务拆分出的片段（拆课/分段排班），互相之间不报重叠 */
    parentId: z.string().min(1).nullable().optional(),
    /** 0-1 进度；≥0.8 的截止提醒只出灰点 */
    progress: z.number().min(0).max(1).optional(),
    /** 完成该任务的估算工作量；缺省 = durationMin */
    estateMin: z.number().int().min(0).max(24 * 60).optional(),
  })
  .superRefine(refineTimeBlock);
export type Task = z.infer<typeof TaskSchema>;

/** 人工新增 / AI 解析产出统一用 Draft：没有 id 与 done，由 store 落库时补齐 */
export const TaskDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    start: isoOrNull,
    end: isoOrNull,
    durationMin: minutesField,
    deadline: isoOrNull,
    priority: priorityField,
    rawTextOrigin: z.string().max(500).nullable(),
  })
  .superRefine(refineTimeBlock);
export type TaskDraft = z.infer<typeof TaskDraftSchema>;

export const TaskListSchema = z.array(TaskSchema);
export const TaskDraftListSchema = z.array(TaskDraftSchema).min(1).max(60);

/** AI 结构化输出契约：只允许这 7 个字段，多一个都不要 */
export const AiTaskDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    start: isoOrNull,
    end: isoOrNull,
    durationMin: minutesField,
    deadline: isoOrNull,
    priority: priorityField,
    rawTextOrigin: z.string().max(500).nullable(),
  })
  .superRefine(refineTimeBlock);
export type AiTaskDraft = z.infer<typeof AiTaskDraftSchema>;

export const AiParseOutputSchema = z.object({
  tasks: z.array(AiTaskDraftSchema).min(1).max(40),
});
export type AiParseOutput = z.infer<typeof AiParseOutputSchema>;
