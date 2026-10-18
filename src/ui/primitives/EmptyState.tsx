import type { ReactNode } from "react";
import { cn } from "@/shared/utils";

/**
 * 空态 —— 三态之二。
 * 空态必须"带下一步动作"，只写"暂无数据"是最容易丢分的地方。
 */
export function EmptyState({
  title,
  description,
  action,
  icon = "◇",
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-sm bg-ink-800/40 px-4 py-8 text-center ring-1 ring-inset ring-ink-700/60",
        className,
      )}
    >
      <span aria-hidden className="font-mono text-title text-ink-600">
        {icon}
      </span>
      <p className="text-caption font-medium text-ink-200">{title}</p>
      {description ? <p className="max-w-md text-micro text-ink-400">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
