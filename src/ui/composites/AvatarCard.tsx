"use client";

import { motion } from "framer-motion";
import { AVATAR_STATE_LABEL, type AvatarSummary, type AvatarState } from "@/domain/avatar";
import { formatDuration } from "@/domain/time";
import { Badge, Card, CardText, CardTitle } from "@/ui/primitives";

/**
 * 数字分身 —— 一条细环 + 一层柔光，不做脸、不做立绘。
 *
 * 亮色版口径（用户否掉了"粗红环 + 方脸"那一版：像表情包，不是苹果/ins 风）：
 *   1. 环只有 3px，进度弧用同一色相的渐变淡出，不是一根实心粗圈；
 *   2. 圈心不放脸，只放**数字**（今日负载 %），"状态"由数字和光晕说；
 *   3. 三态区别靠色相 + 光晕强弱，不靠卡通表情：
 *        满血 = 品牌靛蓝 + 大范围柔光
 *        疲惫 = 暖灰 + 极弱光
 *        超载 = 珊瑚红 + 收紧的红晕
 *
 * FR-18 硬约束：组件内不写十六进制色值，一律引用 design-tokens 的 CSS 变量。
 */
const PALETTE: Record<AvatarState, { ring: string; glow: string }> = {
  energized: { ring: "var(--color-brand-500)", glow: "var(--color-brand-300)" },
  tired: { ring: "var(--color-ink-400)", glow: "var(--color-ink-600)" },
  overloaded: { ring: "var(--color-danger-500)", glow: "var(--color-prio-high-bg)" },
};

/** 光晕强弱：满血扩散、疲惫几乎收住、超载贴着环 */
const GLOW: Record<AvatarState, { spread: string; opacity: number }> = {
  energized: { spread: "92%", opacity: 0.5 },
  tired: { spread: "70%", opacity: 0.26 },
  overloaded: { spread: "80%", opacity: 0.62 },
};

/** 呼吸：超载最快、疲惫最慢，这是"体感"线索，不是装饰 */
const BREATH: Record<AvatarState, number> = {
  energized: 4.2,
  tired: 7,
  overloaded: 2.2,
};

const RADIUS = 50;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function AvatarCard({ summary }: { summary: AvatarSummary }) {
  const palette = PALETTE[summary.state];
  const glow = GLOW[summary.state];
  // 环画的是「今天被排掉了多少」：到 100% 就是排满，超过 100 仍画满但数字照实显示
  const loadPercent = Math.round(summary.loadRatio * 100);
  const ringProgress = Math.min(1, Math.max(0, summary.loadRatio));
  const offset = CIRCUMFERENCE * (1 - ringProgress);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <CardTitle>第二自我</CardTitle>
          <CardText className="mt-1">状态由今日负载与完成度驱动，会自己变</CardText>
        </div>
        <Badge
          className="shrink-0 whitespace-nowrap"
          tone={summary.state === "energized" ? "ok" : summary.state === "tired" ? "warn" : "danger"}
        >
          {AVATAR_STATE_LABEL[summary.state]}
        </Badge>
      </div>

      <div className="flex items-center gap-5">
        <div className="relative grid size-24 shrink-0 place-items-center">
          {/* 柔光：一圈径向渐变，比 drop-shadow 更像光，也更不"脏" */}
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle at 50% 50%, ${palette.glow} 0%, transparent ${glow.spread})`,
              opacity: glow.opacity,
            }}
            animate={{ opacity: [glow.opacity, glow.opacity * 0.55, glow.opacity] }}
            transition={{
              duration: BREATH[summary.state],
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
          />

          <svg viewBox="0 0 120 120" className="absolute size-24" aria-hidden>
            <defs>
              <linearGradient id="avatar-ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={palette.ring} stopOpacity="1" />
                <stop offset="100%" stopColor={palette.ring} stopOpacity="0.45" />
              </linearGradient>
            </defs>
            {/* 轨道只有 3px：亮色底上细一点才干净 */}
            <circle
              cx="60"
              cy="60"
              r={RADIUS}
              fill="none"
              stroke="var(--color-ink-800)"
              strokeWidth="3"
            />
            <motion.circle
              cx="60"
              cy="60"
              r={RADIUS}
              fill="none"
              stroke="url(#avatar-ring)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              transform="rotate(-90 60 60)"
              initial={{ strokeDashoffset: CIRCUMFERENCE }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            />
          </svg>

          <div className="relative flex flex-col items-center leading-none">
            <span className="tnum text-[22px] font-semibold text-ink-50">{loadPercent}</span>
            <span className="mt-0.5 text-[10px] font-medium text-ink-400">% 今日负载</span>
            <span className="sr-only">
              分身状态：{AVATAR_STATE_LABEL[summary.state]}，今日负载 {loadPercent}%
            </span>
          </div>
        </div>

        <dl className="grid flex-1 grid-cols-2 gap-x-3 gap-y-2 text-micro">
          <div>
            <dt className="text-ink-400">完成度</dt>
            <dd className="tnum font-mono text-ink-100">{Math.round(summary.progress * 100)}%</dd>
          </div>
          <div>
            <dt className="text-ink-400">剩余待办</dt>
            <dd className="tnum font-mono text-ink-100">{summary.pendingCount}</dd>
          </div>
          <div>
            <dt className="text-ink-400">已排负载</dt>
            <dd className="whitespace-nowrap font-mono text-ink-100">
              {formatDuration(summary.loadMin)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-400">当日上限</dt>
            <dd className="whitespace-nowrap font-mono text-ink-100">
              {formatDuration(summary.limitMin)}
            </dd>
          </div>
        </dl>
      </div>

      <p className="rounded-2xl bg-ink-800/70 px-3 py-2 text-caption leading-relaxed text-ink-200">
        {summary.broadcast}
      </p>
    </Card>
  );
}
