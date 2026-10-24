import { z } from "zod";
import { WeekSpecSchema } from "./schedule";

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
  1: "重要",
  2: "一般",
  3: "轻松",
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

/**
 * 把落库的 1/2/3 映射成三档。
 * 为什么不用 PRIORITY_BAND 直接下标：schema 里 priority 的类型是 number（受
 * min(1).max(3) 约束），外部脏数据仍可能越界；这里收敛成"越界取最近档"，
 * 规则4 就不会因为一个坏字段整条崩掉。
 */
export function priorityBandOf(priority: number): PriorityBand {
  if (priority <= 1) return "high";
  if (priority === 2) return "medium";
  return "low";
}

const isoOrNull = z.string().nullable();
const minutesField = z.number().int().min(0).max(24 * 60);
const priorityField = z.number().int().min(1).max(3);

/**
 * 重复规则。
 *
 * 关键决定：**"每周二晚 9 点"必须是一条 Task，不许展开成多条。**
 * 理由是数据层的：展开成多条之后，用户改一次时间要改十几条、删一次要删十几条，
 * "这周三改到周四"这种临时调整还会变成一堆孤立记录。
 * 展开只发生在**冲突检测计算的那一刻**（`time.ts` 的 `expandOccurrences`），
 * 算完即丢、不落盘。
 *
 * `byDay` 用 ISO 星期：1=周一 … 7=周日。`Date.getDay()` 是 0=周日，
 * 换算只在 `expandOccurrences` 里做一次 —— 别在业务代码里到处 +1。
 */
export const RepeatRuleSchema = z.object({
  kind: z.literal("weekly"),
  byDay: z.array(z.number().int().min(1).max(7)).min(1),
  /**
   * 学期周次范围（第几周到第几周 + 单双周 + 排除周）。
   * 缺省 = 每周都上 —— 旧数据里没有这个字段，行为与加字段之前完全一致（零迁移）。
   * 判定顺序固定为 范围 → 单双周 → 排除周，排除周是否决票（见 `isWeekActive`）。
   */
  weeks: WeekSpecSchema.nullable().optional(),
});
export type RepeatRule = z.infer<typeof RepeatRuleSchema>;

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
    completedOn: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
    /** 来自粘贴文本的原始行，用于人工修正时溯源 */
    rawTextOrigin: z.string().max(2000).nullable(),
    /**
     * 以下字段是冲突/重排规则需要的约束信息，分两类：
     *
     * **必填**：`locked` / `repeat` / `needsReview`。
     * 理由（主Bot 裁决 2026-10-18）：可省略 = 缺失即静默通过，
     * 那么 reflow 的信任指标 `lockedTouched === 0` 就没有可靠输入 ——
     * "这条任务到底锁没锁"不能靠"没写就当没锁"来猜。
     * 旧数据兼容不在这里做：`src/data/migrate.ts` 的 v2→v3 归一化会把缺失字段补成
     * `locked:false / repeat:null / needsReview:false`，所以 localStorage 里的历史记录
     * 照旧能读，而**domain 契约保持严格**——两层各管一件事，互不稀释。
     *
     * **可选**：`location` / `flexible` / `parentId` / `progress` / `estateMin`。
     * 缺省即"不知道"，规则里按"不知道"降档处理，绝不替用户编造。
     */
    /** 地点（'教室A' / '市区鼓楼'…）；null = 未知，缓冲规则会降为灰点 */
    location: z.string().trim().max(60).nullable().optional(),
    /** true = 固定块（课表/排班），重排不得移动。用户权威标记，AI 无权设置。
     *  **必填**：可省略等于"静默通过"，reflow 判"固定课被挪 0 条"就没有可靠输入。 */
    locked: z.boolean(),
    /** true = 可顺延/可压缩 */
    flexible: z.boolean().optional(),
    /** 同一父任务拆分出的片段（拆课/分段排班），互相之间不报重叠 */
    parentId: z.string().min(1).nullable().optional(),
    /** 0-1 进度；≥0.8 的截止提醒只出灰点 */
    progress: z.number().min(0).max(1).optional(),
    /** 完成该任务的估算工作量；缺省 = durationMin */
    estateMin: z.number().int().min(0).max(24 * 60).optional(),
    /** 重复规则；null = 单次。一条重复安排只存一行，展开只在检测时发生 */
    repeat: RepeatRuleSchema.nullable(),
    /** AI 自己标出的"不确定，请人工核对"；用户在修正表里改过就会清掉 */
    needsReview: z.boolean(),
    /** 时长是默认值估出来的（原文只给开始时间）→ 界面显示「约 N 分钟 · 待确认」 */
    durationInferred: z.boolean().optional(),
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
    /** 解析时靠推测得到的条目（原文没给明确时段/时长）→ 修正表里高亮 */
    needsReview: z.boolean(),
    /**
     * 时长是**估出来的**（原文只给了开始时间、没给时长，按默认 90 分钟兜底）。
     * 界面上必须显示成“约 N 分钟 · 待确认”——只把标记留在数据里、界面看不出来，
     * 等于“猜了一个数还告诉用户这是确定的”，比留空更糟（主管chief 裁定）。
     */
    durationInferred: z.boolean().optional(),
    /** 「每周二晚 9 点」这种周期安排：一条草稿，不展开 */
    repeat: RepeatRuleSchema.nullable(),
    /**
     * 以下三项只允许**本地规则/用户**给出，模型契约（AiTaskDraftSchema）里没有：
     * locked 是用户权威标记，AI 无权设置；location 影响缓冲规则，也由本地抽取。
     */
    location: z.string().trim().max(60).nullable().optional(),
    locked: z.boolean().optional(),
    flexible: z.boolean().optional(),
  })
  .superRefine(refineTimeBlock);
export type TaskDraft = z.infer<typeof TaskDraftSchema>;

export const TaskListSchema = z.array(TaskSchema);
export const TaskDraftListSchema = z.array(TaskDraftSchema).min(1).max(60);

/** AI 结构化输出契约：只允许这 9 个字段，多一个都不要 */
export const AiTaskDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    start: isoOrNull,
    end: isoOrNull,
    durationMin: minutesField,
    deadline: isoOrNull,
    priority: priorityField,
    rawTextOrigin: z.string().max(500).nullable(),
    /** 模型必须自评：这一条是不是靠猜的（必填，不许省略） */
    needsReview: z.boolean(),
    /**
     * 周期安排：「每周二晚 9 点」→ { kind:'weekly', byDay:[2] }，不许展开成多条。
     * **必填**：不填就等于"解析器根本没这个能力"，模型也无处承接（byDay 用 ISO 星期 1=周一…7=周日）。
     * 单次任务必须显式给 null。
     */
    repeat: RepeatRuleSchema.nullable(),
  })
  .superRefine(refineTimeBlock);
export type AiTaskDraft = z.infer<typeof AiTaskDraftSchema>;

export const AiParseOutputSchema = z.object({
  tasks: z.array(AiTaskDraftSchema).min(1).max(40),
});
export type AiParseOutput = z.infer<typeof AiParseOutputSchema>;
