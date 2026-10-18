"use client";

import type { HeadlineView } from "./headline";

/**
 * 首屏那句结论 —— 整页最大的字，只做一件事：
 * 让「今天几件事」和「哪里撞了」在同一视线高度被读完。
 *
 * 亮色口径：整句用最重的墨色，只有冲突那半句上语义色；
 * 颜色是第三层信号，真正承载信息的永远是文字本身。
 * 刻意不留任何角标/胶囊：层级靠字号与字重，不靠小标签。
 */
const TONE: Record<HeadlineView["tone"], string> = {
  danger: "text-danger-400",
  warn: "text-warn-400",
  ok: "text-ok-400",
  empty: "text-ink-300",
};

export function TodayHeadline({ view }: { view: HeadlineView }) {
  return (
    <section className="flex flex-col gap-2 px-1 pt-1">
      <h1 className="text-balance text-headline font-semibold text-ink-50 sm:text-title">
        {view.lead}
        {view.emphasis ? <span className={TONE[view.tone]}>{view.emphasis}</span> : null}
        {view.tail}
      </h1>

      <p className="max-w-[42ch] text-caption leading-relaxed text-ink-300">{view.detail}</p>
    </section>
  );
}
