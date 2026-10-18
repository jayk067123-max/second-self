import { type Conflict, type Severity } from "@/domain/conflicts";
import type { Task } from "@/domain/schemas/task";
import { addDaysToKey, formatClock, formatDuration, parseIsoToMs } from "@/domain/time";

/**
 * 首屏那句「人话」—— 纯函数，只做文字组织，不做任何业务判定。
 *
 * 为什么要有这一层：时间轴回答「什么时候」，结论回答「我现在该慌什么」。
 * 首页第一眼必须是一句话，而不是一排卡片；这句话只能由**已有数据**拼出来，
 * 不许编、不许润色成广告语。所以这里只做三件事：
 *   1. 数今天有几件事；
 *   2. 从冲突里挑一条最该说的（严重度 → 日期先后）；
 *   3. 把它拼成一句带主谓的中文，并把"冲突那半句"单独交出来给组件染色。
 */

export interface HeadlineView {
  tone: "danger" | "warn" | "ok" | "empty";
  /** 句子的前半句（今天几件事），必显示 */
  lead: string;
  /** 句子的冲突半句；无冲突时为 null。组件负责给它上色 */
  emphasis: string | null;
  /** 句尾标点，单独给出来避免中文标点被染色或断行 */
  tail: string;
  /** 纯文本整句（给 aria-label / 复制用） */
  plain: string;
  /** 第二行：来自冲突自己的 humanMessage（自带数字锚点），或空态的下一步 */
  detail: string;
  /** 右上角摘要小标 */
  summary: string;
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** 三天窗口：今天 / 明天 / 后天。返回 dayKey 与中文标签，顺序即展示顺序 */
export function threeDayWindow(todayKey: string): { dayKey: string; label: string }[] {
  return [
    { dayKey: todayKey, label: "今天" },
    { dayKey: addDaysToKey(todayKey, 1), label: "明天" },
    { dayKey: addDaysToKey(todayKey, 2), label: "后天" },
  ];
}

function clockOfConflict(conflict: Conflict, tasksById: Map<string, Task>): string | null {
  // 取**较晚**那个开始时间：缓冲/重叠都是"后一件事开始时"才发生的，
  // 用较早的那个会说成"18:30 两件事没留缓冲"，而 18:30 其实什么事都没有。
  let latest: number | null = null;
  for (const id of conflict.involvedTaskIds) {
    const start = parseIsoToMs(tasksById.get(id)?.start ?? null);
    if (start !== null && (latest === null || start > latest)) latest = start;
  }
  return latest === null ? null : formatClock(latest);
}

function numberFrom(conflict: Conflict, key: string): number | null {
  const value = conflict.evidence[key];
  return typeof value === "number" ? value : null;
}

export function buildHeadline(input: {
  todayKey: string;
  todayCount: number;
  windowCount: number;
  conflicts: readonly Conflict[];
  tasksById: Map<string, Task>;
}): HeadlineView {
  const { todayKey, todayCount, windowCount, conflicts, tasksById } = input;

  if (windowCount === 0) {
    return {
      tone: "empty",
      lead: "今天还没有安排。",
      emphasis: null,
      tail: "",
      plain: "今天还没有安排。",
      detail: "先记一件，我就有东西可排了；课表贴进来也行。",
      summary: "还没有安排",
    };
  }

  const top = [...conflicts].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.date.localeCompare(b.date),
  )[0];

  if (!top) {
    const lead = `今天 ${todayCount} 件事，`;
    return {
      tone: "ok",
      lead,
      emphasis: "时间没有打架",
      tail: "。",
      plain: `${lead}时间没有打架。`,
      detail: `近三天共 ${windowCount} 件事，冲突检测跑完是 0 处。`,
      summary: "0 冲突",
    };
  }

  const dayLabel =
    top.date === todayKey
      ? ""
      : top.date === addDaysToKey(todayKey, 1)
        ? "明天 "
        : top.date === addDaysToKey(todayKey, 2)
          ? "后天 "
          : `${top.date.slice(5)} `;

  const clock = clockOfConflict(top, tasksById);
  let clause: string;
  switch (top.conflictType) {
    case "overlap":
      clause = `${clock ?? ""} 两件事完全重叠`;
      break;
    case "buffer": {
      const gap = numberFrom(top, "gapMin");
      clause = `${clock ?? ""} 两件事中间只有 ${gap ?? 0} 分钟`;
      break;
    }
    case "overload": {
      const used = numberFrom(top, "usedMin");
      clause = `排满了 ${used === null ? "一整天" : formatDuration(used)}`;
      break;
    }
    case "deadline": {
      const title = tasksById.get(top.involvedTaskIds[0] ?? "")?.title;
      clause = title ? `「${title}」就要截止了` : "有件事就要截止了";
      break;
    }
  }

  const prefix = todayCount === 0 ? "" : top.date === todayKey ? "其中 " : "但";
  const lead = todayCount === 0 ? "今天没有安排，" : `今天 ${todayCount} 件事，`;
  const emphasis = `${prefix}${dayLabel}${clause}`.trim();
  const highCount = conflicts.filter((c) => c.severity === "high").length;

  return {
    tone: top.severity === "high" ? "danger" : top.severity === "medium" ? "warn" : "ok",
    lead,
    emphasis,
    tail: "。",
    plain: `${lead}${emphasis}。`,
    detail: top.humanMessage,
    summary: highCount > 0 ? `${highCount} 处要处理` : `${conflicts.length} 处提醒`,
  };
}
