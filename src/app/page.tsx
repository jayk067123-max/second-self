import { Badge, Button, Card, CardText, CardTitle, Dot } from "@/ui/primitives";
import { HealthPanel } from "@/ui/composites/HealthPanel";
import {
  APP_NAME,
  APP_SUBTITLE,
  APP_VERSION,
  ARCHITECTURE_LAYERS,
} from "@/shared/constants";

/** 设计令牌巡览数据：仅用于落地页展示，改动请同步 globals.css */
const COLOR_SWATCHES = [
  { name: "brand-500", className: "bg-brand-500", use: "主操作 / 强调" },
  { name: "accent-400", className: "bg-accent-400", use: "成功提示 / 数据" },
  { name: "ok-400", className: "bg-ok-400", use: "通过" },
  { name: "warn-400", className: "bg-warn-400", use: "降级 / 待确认" },
  { name: "danger-400", className: "bg-danger-400", use: "错误 / 需修复" },
  { name: "ink-800", className: "bg-ink-800 ring-1 ring-inset ring-ink-600", use: "卡片/面板底" },
] as const;

const TYPE_SCALE = [
  { token: "text-display", sample: "Aa 显示级", className: "text-display font-semibold" },
  { token: "text-title", sample: "Aa 标题级", className: "text-title font-semibold" },
  { token: "text-section", sample: "Aa 小节级", className: "text-section" },
  { token: "text-body", sample: "Aa 正文级：默认阅读字号", className: "text-body" },
  { token: "text-caption", sample: "Aa 说明级", className: "text-caption text-ink-300" },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-gutter py-14">
      {/* ---------- 顶栏 ---------- */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-md bg-brand-500 font-mono text-caption font-bold text-ink-950">
            VC
          </span>
          <div className="leading-tight">
            <p className="text-caption font-semibold text-ink-50">{APP_NAME}</p>
            <p className="text-micro text-ink-400">{APP_SUBTITLE}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="warn">
            <Dot tone="warn" />
            选题待定
          </Badge>
          <Badge tone="brand">骨架 v{APP_VERSION}</Badge>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="flex flex-col gap-6">
        <Badge tone="brand" className="w-fit">
          工程地基 · 与选题无关
        </Badge>
        <h1 className="max-w-3xl text-display font-semibold text-ink-50">
          四层解耦的
          <span className="text-brand-400"> 可复现基座</span>
        </h1>
        <p className="max-w-2xl text-body text-ink-300">
          这一页只证明一件事：仓库能跑、分层立住了、自检通得过。
          业务功能等选题拍板后再长在上面，不在骨架里预留半成品。
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" disabled title="选题确认后开放">
            开始使用（选题确认后开放）
          </Button>
          <a
            href="/api/health"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-pill bg-ink-800 px-6 text-body font-medium text-ink-100 ring-1 ring-inset ring-ink-600 transition-colors hover:bg-ink-700 hover:ring-ink-400"
          >
            查看 /api/health
          </a>
        </div>
      </section>

      {/* ---------- 四层架构 ---------- */}
      <section className="flex flex-col gap-5">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-title font-semibold text-ink-50">模块边界</h2>
          <p className="text-caption text-ink-400">依赖方向单向：app → ui / domain / data / ai</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {ARCHITECTURE_LAYERS.map((layer) => (
            <Card key={layer.key} interactive className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{layer.label}</CardTitle>
                <span className="font-mono text-micro text-brand-300">{layer.path}</span>
              </div>
              <CardText>{layer.boundary}</CardText>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------- 自检 ---------- */}
      <section className="flex flex-col gap-5">
        <h2 className="text-title font-semibold text-ink-50">跑通验证</h2>
        <HealthPanel />
      </section>

      {/* ---------- 设计令牌 ---------- */}
      <section className="flex flex-col gap-5">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-title font-semibold text-ink-50">设计令牌</h2>
          <p className="text-caption text-ink-400">全部定义在 src/app/globals.css 的 @theme</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col gap-4">
            <CardTitle>色板</CardTitle>
            <ul className="flex flex-col gap-2">
              {COLOR_SWATCHES.map((c) => (
                <li key={c.name} className="flex items-center gap-3">
                  <span className={`size-6 shrink-0 rounded-sm ${c.className}`} />
                  <span className="font-mono text-micro text-ink-200">{c.name}</span>
                  <span className="ml-auto text-micro text-ink-400">{c.use}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="flex flex-col gap-3">
            <CardTitle>字号层级</CardTitle>
            <ul className="flex flex-col gap-2">
              {TYPE_SCALE.map((t) => (
                <li key={t.token} className="flex items-baseline justify-between gap-4">
                  <span className={`${t.className} truncate`}>{t.sample}</span>
                  <span className="shrink-0 font-mono text-micro text-ink-400">{t.token}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      {/* ---------- 页脚 ---------- */}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-800 pt-6 text-micro text-ink-400">
        <p>全国高校 Vibe Coding 开发挑战赛 · 省赛预指导提交截止 2026-10-31 15:00</p>
        <p className="font-mono">Node ≥22.11 · Next.js 16 · TypeScript 5.9</p>
      </footer>
    </main>
  );
}
