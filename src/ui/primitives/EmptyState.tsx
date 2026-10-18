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
  bare = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: string;
  className?: string;
  /** 去掉自带的底色与描边：外面已经有一张卡时用，避免"卡里套卡" */
  bare?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 px-5 py-10 text-center",
        !bare && "rounded-card bg-ink-800/60",
        className,
      )}
    >
      <span aria-hidden className="font-mono text-title leading-none text-ink-500">
        {icon}
      </span>
      <p className="mt-1 text-body font-medium text-ink-50">{title}</p>
      {description ? (
        <p className="max-w-[34ch] text-caption text-ink-300">{description}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
