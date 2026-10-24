"use client";

import { useEffect, useState } from "react";
import { describeHealth } from "@/domain/health";
import { HealthReportSchema, type HealthReport } from "@/domain/schemas/system";
import { Badge, Button, Card, CardText, CardTitle, Dot, SkeletonList } from "@/ui/primitives";

type State =
  | { kind: "loading" }
  | { kind: "ready"; report: HealthReport }
  | { kind: "error"; message: string };

/**
 * 展示层组合件：只负责「取数 + 渲染三种状态」。
 * 取数逻辑集中在 effect 内，业务判定交给 domain 的纯函数（describeHealth）。
 * 重新检测通过递增 nonce 触发，不在 effect 里同步 setState。
 */
export function HealthPanel() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!alive) return;
        if (!res.ok) {
          setState({ kind: "error", message: `HTTP ${res.status}` });
          return;
        }
        const json: unknown = await res.json();
        if (!alive) return;
        // 客户端同样再校验一次：不信任任何外部返回
        const parsed = HealthReportSchema.safeParse(json);
        if (!parsed.success) {
          setState({ kind: "error", message: "自检返回结构不符合契约" });
          return;
        }
        setState({ kind: "ready", report: parsed.data });
      } catch (err) {
        if (!alive) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "请求失败",
        });
      }
    }

    void run();
    return () => {
      alive = false;
    };
  }, [nonce]);

  function recheck() {
    setState({ kind: "loading" });
    setNonce((n) => n + 1);
  }

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>环境自检</CardTitle>
          <CardText className="mt-1">GET /api/health · 检查运行环境与六层结构</CardText>
        </div>
        <div className="flex items-center gap-2">
          {state.kind === "loading" && (
            <Badge tone="brand">
              <Dot tone="brand" />
              检测中
            </Badge>
          )}
          {state.kind === "ready" && (
            <Badge tone={state.report.status === "ok" ? "ok" : "warn"}>
              <Dot tone={state.report.status === "ok" ? "ok" : "warn"} />
              {state.report.status === "ok" ? "全部就绪" : "部分降级"}
            </Badge>
          )}
          {state.kind === "error" && (
            <Badge tone="danger">
              <Dot tone="danger" />
              自检失败
            </Badge>
          )}
          <Button variant="secondary" onClick={recheck}>
            重新检测
          </Button>
        </div>
      </div>

      {state.kind === "loading" && <SkeletonList rows={3} label="正在检测环境" />}

      {state.kind === "error" && (
        <p className="rounded-sm bg-danger-500/10 px-3 py-2 text-caption text-danger-400 ring-1 ring-inset ring-danger-500/30">
          没能拿到自检结果：{state.message}。请确认 <code>npm run dev</code> 正在运行。
        </p>
      )}

      {state.kind === "ready" && (
        <>
          <p className="text-caption text-ink-200">
            {describeHealth(state.report)} · 模型模式{" "}
            <span className="font-mono text-accent-400">{state.report.aiMode}</span> · Node{" "}
            <span className="font-mono">{state.report.app.node}</span>
          </p>
          <ul className="flex flex-col divide-y divide-ink-700 rounded-sm ring-1 ring-inset ring-ink-700">
            {state.report.checks.map((check) => (
              <li key={check.name} className="flex items-center gap-3 px-3 py-2">
                <Dot tone={check.ok ? "ok" : "danger"} />
                <span className="font-mono text-micro text-ink-200">{check.name}</span>
                <span className="ml-auto text-right text-micro text-ink-400">
                  {check.detail}
                </span>
              </li>
            ))}
          </ul>
          <details className="text-micro text-ink-400">
            <summary className="cursor-pointer select-none hover:text-ink-200">
              查看原始 JSON
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-sm bg-ink-950 p-3 font-mono text-[11px] leading-relaxed">
              {JSON.stringify(state.report, null, 2)}
            </pre>
          </details>
        </>
      )}
    </Card>
  );
}
