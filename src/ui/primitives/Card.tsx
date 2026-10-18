import type { ComponentProps } from "react";
import { cn } from "@/shared/utils";

export type CardProps = ComponentProps<"section"> & {
  /** 悬停时轻微抬升，仅用于可点区域；纯展示卡片保持 false */
  interactive?: boolean;
};

/** 亮色卡片：白面 + 大圆角 + 一层暖影，**不描边**（用户口径：不要边框和分割线） */
export function Card({ className, interactive = false, ...rest }: CardProps) {
  return (
    <section
      className={cn(
        "rounded-card bg-ink-900 p-5 shadow-card sm:p-6",
        interactive &&
          "transition-[transform,box-shadow] duration-300 ease-soft hover:-translate-y-0.5 hover:shadow-pop",
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
