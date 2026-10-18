import type { HealthReport } from "./schemas/system";

/**
 * 纯函数：从自检报告推导结论。
 * 不含 IO / 不含 Date.now()，同样输入永远同样输出 —— 可直接单测。
 */
export function evaluateHealth(report: HealthReport): {
  ok: boolean;
  failing: string[];
  readyLayers: number;
  totalLayers: number;
} {
  const failingChecks = report.checks.filter((c) => !c.ok).map((c) => c.name);
  const failingLayers = report.layers.filter((l) => !l.ready).map((l) => l.key);
  const failing = [...failingLayers, ...failingChecks];
  return {
    ok: failing.length === 0 && report.status === "ok",
    failing,
    readyLayers: report.layers.filter((l) => l.ready).length,
    totalLayers: report.layers.length,
  };
}

/** 纯函数：人读的一句话结论，UI 与日志共用 */
export function describeHealth(report: HealthReport): string {
  const { ok, failing, readyLayers, totalLayers } = evaluateHealth(report);
  if (ok) return `全部就绪（${readyLayers}/${totalLayers} 层）`;
  return `未就绪：${failing.join("、")}`;
}
