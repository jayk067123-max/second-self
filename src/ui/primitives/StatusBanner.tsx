import type { ReactNode } from "react";
import { cn } from "@/shared/utils";

type Tone = "ok" | "warn" | "danger" | "info";

/**
 * 状态横幅 —— 三态之三（错误态/提示态通用）。
 * 统一 tone 语义，避免每个页面各写一套红黄绿。
 */
const TONE_CLASS: Record<Tone, string> = {
  ok: "bg-ok-500/10 text-ok-400 ring-ok-500/30",
  warn: "bg-warn-500/10 text-warn-400 ring-warn-500/30",
  danger: "bg-danger-500/10 text-danger-400 ring-danger-500/30",
  info: "bg-brand-600/10 text-brand-300 ring-brand-600/30",
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
        "flex flex-wrap items-center justify-between gap-2 rounded-sm px-3 py-2 text-caption ring-1 ring-inset",
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
