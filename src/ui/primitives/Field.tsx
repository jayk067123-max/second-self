import type { ComponentProps } from "react";
import { cn } from "@/shared/utils";

const FIELD_BASE =
  "w-full rounded-sm bg-ink-950/70 px-3 py-2 text-caption text-ink-100 ring-1 ring-inset ring-ink-600 " +
  "placeholder:text-ink-400 focus:ring-2 focus:ring-brand-400 focus:outline-none disabled:opacity-50";

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
