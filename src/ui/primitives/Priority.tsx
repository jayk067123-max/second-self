import { cn } from "@/shared/utils";

/**
 * 优先级标记 —— 全站**唯一**表达「这件事多重要」的组件。
 *
 * 为什么不用纯色条：
 * 用户口径是「重要红 · 一般黄 · 低绿」，但颜色**不许单独承载信息**
 * （色弱、投屏偏色、截图转灰都会失真）。所以三档各带一个形状 + 两个字的文字：
 *   ▲ 重要   ● 一般   ○ 低
 * 形状是实心/空心有别，即使整屏转成黑白也能分出高低。
 *
 * 亮色版改成「浅底 + 深字」的小胶囊：亮底上纯色细字对比度不够，
 * 加浅底之后既有颜色记忆点，又能保证小字号仍然读得清。
 */
export type PriorityLevel = "high" | "mid" | "low";

const SHAPE: Record<PriorityLevel, string> = {
  high: "▲",
  mid: "●",
  low: "○",
};

const LABEL: Record<PriorityLevel, string> = {
  high: "重要",
  mid: "一般",
  low: "轻松",
};

const PILL: Record<PriorityLevel, string> = {
  high: "text-prio-high-400",
  mid: "text-prio-mid-400",
  low: "text-prio-low-400",
};

/** 落库的 1/2/3 → 三档。越界值取最近档，脏数据不至于把整行渲染炸掉 */
export function priorityLevelOf(priority: number): PriorityLevel {
  if (priority <= 1) return "high";
  if (priority === 2) return "mid";
  return "low";
}

export function PriorityMark({
  priority,
  level,
  showText = true,
  className,
}: {
  /** Task.priority：1 重要 / 2 一般 / 3 低 */
  priority?: number;
  /** 已经算好的档位（冲突严重度等场景可直接给） */
  level?: PriorityLevel;
  showText?: boolean;
  className?: string;
}) {
  const lv = level ?? priorityLevelOf(priority ?? 2);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-micro font-semibold whitespace-nowrap",
        PILL[lv],
        className,
      )}
    >
      <span aria-hidden className="text-[9px] leading-none">
        {SHAPE[lv]}
      </span>
      {showText ? LABEL[lv] : <span className="sr-only">{LABEL[lv]}</span>}
    </span>
  );
}
