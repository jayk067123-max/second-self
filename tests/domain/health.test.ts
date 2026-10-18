import { describe, expect, it } from "vitest";
import { describeHealth, evaluateHealth } from "@/domain/health";
import { HealthReportSchema, type HealthReport } from "@/domain/schemas/system";

/** 固定夹具：纯函数测试不依赖时间与环境 */
const baseReport: HealthReport = {
  status: "ok",
  app: { name: "test", version: "0.1.0", env: "test", node: "24.0.0" },
  aiMode: "demo",
  layers: [
    { key: "ui", label: "UI", path: "src/ui", boundary: "b", ready: true, note: "" },
    { key: "domain", label: "Domain", path: "src/domain", boundary: "b", ready: true, note: "" },
  ],
  checks: [
    { name: "runtime.nodejs", ok: true, detail: "ok" },
    { name: "data.write", ok: true, detail: "ok" },
  ],
  checkedAt: "2026-10-18T00:00:00.000Z",
};

describe("evaluateHealth", () => {
  it("全部检查通过时判定为就绪", () => {
    const result = evaluateHealth(baseReport);
    expect(result.ok).toBe(true);
    expect(result.failing).toEqual([]);
    expect(result.readyLayers).toBe(2);
    expect(result.totalLayers).toBe(2);
  });

  it("任一检查失败时汇总出失败项名称", () => {
    const report: HealthReport = {
      ...baseReport,
      status: "degraded",
      checks: [
        { name: "runtime.nodejs", ok: true, detail: "ok" },
        { name: "data.write", ok: false, detail: "EACCES" },
      ],
    };
    const result = evaluateHealth(report);
    expect(result.ok).toBe(false);
    expect(result.failing).toContain("data.write");
  });

  it("某层未就位时也判为未就绪", () => {
    const report: HealthReport = {
      ...baseReport,
      layers: [{ ...baseReport.layers[0]!, ready: false }],
    };
    const result = evaluateHealth(report);
    expect(result.ok).toBe(false);
    expect(result.failing).toContain("ui");
  });

  it("status=degraded 时即使各检查通过也不谎报就绪", () => {
    const result = evaluateHealth({ ...baseReport, status: "degraded" });
    expect(result.ok).toBe(false);
  });
});

describe("describeHealth", () => {
  it("就绪时给出层数概览", () => {
    expect(describeHealth(baseReport)).toBe("全部就绪（2/2 层）");
  });

  it("未就绪时列出失败项", () => {
    const text = describeHealth({
      ...baseReport,
      checks: [{ name: "data.write", ok: false, detail: "EACCES" }],
    });
    expect(text).toBe("未就绪：data.write");
  });
});

describe("HealthReportSchema", () => {
  it("接受合法报告", () => {
    const parsed = HealthReportSchema.safeParse(baseReport);
    expect(parsed.success).toBe(true);
  });

  it("拒绝未知的层 key —— 防止分层定义漂移", () => {
    const parsed = HealthReportSchema.safeParse({
      ...baseReport,
      layers: [{ key: "backend", label: "x", path: "x", boundary: "x", ready: true, note: "" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("拒绝缺失必填字段的报告", () => {
    const { checks: _checks, ...withoutChecks } = baseReport;
    const parsed = HealthReportSchema.safeParse(withoutChecks);
    expect(parsed.success).toBe(false);
  });
});
