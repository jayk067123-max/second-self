import type { ComponentProps } from "react";
import { cn } from "@/shared/utils";

type Tone = "neutral" | "brand" | "ok" | "warn" | "danger";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-ink-800 text-ink-200 ring-ink-600",
  brand: "bg-brand-600/25 text-brand-300 ring-brand-600/50",
  ok: "bg-ok-500/15 text-ok-400 ring-ok-500/40",
  warn: "bg-warn-500/15 text-warn-400 ring-warn-500/40",
  danger: "bg-danger-500/15 text-danger-400 ring-danger-500/40",
};

export type BadgeProps = ComponentProps<"span"> & { tone?: Tone };

export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-micro font-medium ring-1 ring-inset",
        TONE_CLASS[tone],
        className,
      )}
      {...rest}
    />
  );
}

/** 状态圆点：颜色语义与 Badge 一致 */
export function Dot({ tone = "neutral" }: { tone?: Tone }) {
  const color: Record<Tone, string> = {
    neutral: "bg-ink-400",
    brand: "bg-brand-400",
    ok: "bg-ok-400",
    warn: "bg-warn-400",
    danger: "bg-danger-400",
  };
  return <span className={cn("size-1.5 rounded-pill", color[tone])} aria-hidden />;
}
