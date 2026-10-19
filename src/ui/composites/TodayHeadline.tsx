"use client";

import type { AvatarState, AvatarSummary } from "@/domain/avatar";
import { cn } from "@/shared/utils";
import type { HeadlineView } from "./headline";

/**
 * 首屏那句结论 —— 整页最大的字，只做一件事：
 * 让「今天几件事」和「哪里撞了」在同一视线高度被读完。
 *
 * 亮色口径：整句用最重的墨色，只有冲突那半句上语义色；
 * 颜色是第三层信号，真正承载信息的永远是文字本身。
 *
 * 右上角那颗「分身 N%」是唯一的小角标，存在的理由只有一个：
 * 分身卡在「我的」页，勾掉一件事之后用户当场看不到它变了。
 * 这个数字取**完成度**（勾选会当场跳），不是今日负载 —— 负载勾选不会变，
 * 挂一个永远不动的数字比不挂更让人困惑。
 */
const TONE: Record<HeadlineView["tone"], string> = {
  danger: "text-danger-400",
  warn: "text-warn-400",
  ok: "text-ok-400",
  empty: "text-ink-300",
};

const AVATAR_DOT: Record<AvatarState, string> = {
  energized: "bg-brand-500",
  tired: "bg-ink-400",
  overloaded: "bg-danger-500",
};

export function TodayHeadline({ view, avatar }: { view: HeadlineView; avatar: AvatarSummary }) {
  const percent = Math.round(avatar.progress * 100);

  return (
    <section className="flex flex-col gap-2 px-1 pt-1">
      {/* 角标做成句尾的一个内联小胶囊，而不是右上角浮块：
          浮块会把 24px 的标题挤成三行（375 宽实测），内联则跟着句子流，不抢宽度。 */}
      <h1 className="text-balance text-headline font-semibold text-ink-50 sm:text-title">
        {view.lead}
        {view.emphasis ? <span className={TONE[view.tone]}>{view.emphasis}</span> : null}
        {view.tail}
        <span
          title={`分身今日完成度 ${percent}%`}
          className="ml-1.5 inline-flex translate-y-[-2px] items-center gap-1 rounded-pill bg-ink-800 px-1.5 py-0.5 align-middle text-micro font-medium text-ink-300"
        >
          <span aria-hidden className={cn("size-1.5 rounded-pill", AVATAR_DOT[avatar.state])} />
          <span className="tnum">分身 {percent}%</span>
          <span className="sr-only">（分身今日完成度）</span>
        </span>
      </h1>

      <p className="max-w-[42ch] text-caption leading-relaxed text-ink-300">{view.detail}</p>
    </section>
  );
}
