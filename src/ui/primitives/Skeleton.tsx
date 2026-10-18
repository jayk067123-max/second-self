import { cn } from "@/shared/utils";

/**
 * 加载态骨架 —— 三态（空/加载/错误）之一，架构 §2 里 primitives 的必备件。
 * 只用 CSS 动画，不引第三方骨架库；aria-busy 让读屏软件知道"正在加载"。
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-sm bg-ink-800", className)} />;
}

/**
 * 列表骨架：默认 3 行，行高按内容密度可调。
 * @param rows 行数
 * @param rowClassName 单行额外样式（例如 h-9 / h-12）
 */
export function SkeletonList({
  rows = 3,
  rowClassName,
  label = "正在加载",
}: {
  rows?: number;
  rowClassName?: string;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-2" aria-busy role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton
          key={index}
          className={cn("h-9", rowClassName)}
          // 逐行错开，视觉上像在加载而不是卡死
        />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
