import type { ReactNode } from "react";
import { cn } from "@/shared/utils";

type Tone = "ok" | "warn" | "danger" | "info";

/**
 * 状态横幅 —— 三态之三（错误态/提示态通用）。
 * 统一 tone 语义，避免每个页面各写一套红黄绿。
 * 亮色版：浅底 + 深字，不描边（边框留给真正的控件）。
 */
const TONE_CLASS: Record<Tone, string> = {
  ok: "bg-prio-low-bg text-ok-400",
  warn: "bg-prio-mid-bg text-warn-400",
  danger: "bg-prio-high-bg text-danger-400",
  info: "bg-brand-500/10 text-brand-300",
};

export function StatusBanner({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3.5 py-2.5 text-caption",
        TONE_CLASS[tone],
        className,
      )}
    >
      <span className="min-w-0">
        {title ? <span className="mr-1 font-medium">{title}</span> : null}
        {children}
      </span>
      {action ? <span className="shrink-0">{action}</span> : null}
    </div>
  );
}
