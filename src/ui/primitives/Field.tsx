import type { ComponentProps } from "react";
import { cn } from "@/shared/utils";

// 亮色口径：输入框用「暖米底、无描边」，靠底色和留白分开；
// 焦点才出现 2px 珊瑚环（键盘用户一眼看得到），不靠默认蓝框。
const FIELD_BASE =
  "w-full rounded-md bg-ink-800/70 px-3 py-2 text-caption text-ink-100 " +
  "placeholder:text-ink-400 focus:bg-ink-900 focus:ring-2 focus:ring-brand-500 focus:outline-none disabled:opacity-50";

export function Label({ className, ...rest }: ComponentProps<"label">) {
  return (
    <label
      className={cn("mb-1 block text-micro font-medium text-ink-300", className)}
      {...rest}
    />
  );
}

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cn(FIELD_BASE, "h-9", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cn(FIELD_BASE, "min-h-32 resize-y leading-relaxed", className)} {...rest} />;
}

export function Select({ className, ...rest }: ComponentProps<"select">) {
  return <select className={cn(FIELD_BASE, "h-9", className)} {...rest} />;
}
