import type { ComponentProps } from "react";
import { cn } from "@/shared/utils";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

/**
 * 亮色口径：
 * - primary 珊瑚实心 + 白字（对比 4.9:1），悬停加深而不是变浅——浅底上变浅会掉对比
 * - secondary 暖米底，不描边：它常放在白卡里，纯白底按钮会"消失"
 * - ghost 只做文字与浅底，用在"撤销/清空"这种低权重操作
 */
const VARIANT_CLASS: Record<Variant, string> = {
  primary:
    "bg-brand-500 text-on-solid shadow-glow hover:bg-brand-600 active:bg-brand-700",
  secondary:
    "bg-ink-800 text-ink-100 hover:bg-ink-700 active:bg-ink-600",
  ghost: "bg-transparent text-ink-300 hover:bg-ink-800 hover:text-ink-50",
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
        "inline-flex items-center justify-center gap-2 rounded-pill font-medium transition-[background-color,box-shadow,transform] duration-200 ease-standard",
        "active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className,
      )}
      {...rest}
    />
  );
}
