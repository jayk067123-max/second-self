import type { ComponentProps } from "react";
import { cn } from "@/shared/utils";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

const VARIANT_CLASS: Record<Variant, string> = {
  primary:
    "bg-brand-500 text-ink-950 hover:bg-brand-400 active:bg-brand-600 shadow-glow",
  secondary:
    "bg-ink-800 text-ink-100 ring-1 ring-inset ring-ink-600 hover:bg-ink-700 hover:ring-ink-400",
  ghost: "bg-transparent text-ink-200 hover:bg-ink-800 hover:text-ink-50",
};

const SIZE_CLASS: Record<Size, string> = {
  md: "h-10 px-4 text-caption",
  lg: "h-12 px-6 text-body",
};

export type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
};

/** 展示层原子组件：无状态、无副作用、无 IO */
export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-pill font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-45",
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className,
      )}
      {...rest}
    />
  );
}
