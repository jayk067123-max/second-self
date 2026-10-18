import type { ComponentProps } from "react";
import { cn } from "@/shared/utils";

type Tone = "neutral" | "brand" | "ok" | "warn" | "danger";

/** 亮色版：一律「浅底 + 深字」，不用描边环，靠底色分层 */
const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-ink-800 text-ink-300",
  brand: "bg-brand-500/12 text-brand-300",
  ok: "bg-prio-low-bg text-ok-400",
  warn: "bg-prio-mid-bg text-warn-400",
  danger: "bg-prio-high-bg text-danger-400",
};

export type BadgeProps = ComponentProps<"span"> & { tone?: Tone };

export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-micro font-medium",
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
