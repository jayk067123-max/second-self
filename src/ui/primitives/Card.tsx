import type { ComponentProps } from "react";
import { cn } from "@/shared/utils";

export type CardProps = ComponentProps<"section"> & {
  /** 悬停时轻微抬升，仅用于可点区域；纯展示卡片保持 false */
  interactive?: boolean;
};

export function Card({ className, interactive = false, ...rest }: CardProps) {
  return (
    <section
      className={cn(
        "rounded-card bg-ink-900/80 p-6 ring-1 ring-inset ring-ink-700 shadow-card backdrop-blur",
        interactive && "transition-transform duration-200 hover:-translate-y-0.5",
        className,
      )}
      {...rest}
    />
  );
}

export function CardTitle({ className, ...rest }: ComponentProps<"h3">) {
  return (
    <h3
      className={cn("text-section font-semibold text-ink-50", className)}
      {...rest}
    />
  );
}

export function CardText({ className, ...rest }: ComponentProps<"p">) {
  return <p className={cn("text-caption text-ink-300", className)} {...rest} />;
}
