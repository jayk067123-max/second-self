import { describe, expect, it } from "vitest";
import {
  EMPTY_PAYLOAD,
  ExportEnvelopeSchema,
  buildExportEnvelope,
  exportFileName,
  serializeExport,
} from "@/data/storage";
import { migrateImportedPayload, migrateStoredPayload } from "@/data/migrate";
import { createMemoryStore, createPlannerAdapter } from "@/data/local-adapter";
import { makeTask } from "../helpers/fixtures";

const task = makeTask({ title: "高等数学作业", start: null, end: null, durationMin: 90 });

describe("导出信封", () => {
  it("信封字段齐全且能通过契约校验", () => {
    const now = new Date("2026-10-18T08:30:00.000Z");
    const envelope = buildExportEnvelope({ tasks: [task], snapshot: null }, now);
    expect(ExportEnvelopeSchema.safeParse(envelope).success).toBe(true);
    expect(envelope.format).toBe("vibe-coding-2026/planner");
    expect(envelope.version).toBe(2);
    expect(envelope.exportedAt).toBe(now.toISOString());
  });

  it("序列化后是可读 JSON（带缩进）并能被自己解析回来", () => {
    const envelope = buildExportEnvelope({ tasks: [task], snapshot: null }, new Date());
    const text = serializeExport(envelope);
    expect(text).toContain("\n  \"format\"");
    expect(JSON.parse(text)).toEqual(envelope);
  });

  it("文件名带时间戳", () => {
    const name = exportFileName(new Date(2026, 9, 18, 16, 30));
    expect(name).toBe("vibe-planner-20261018-1630.json");
  });
});

describe("导入迁移", () => {
  it("接受自己导出的文件（往返一致）", () => {
    const envelope = buildExportEnvelope({ tasks: [task], snapshot: [task] }, new Date());
    const result = migrateImportedPayload(JSON.parse(serializeExport(envelope)));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tasks).toHaveLength(1);
      expect(result.value.snapshot).toHaveLength(1);
    }
  });

  it("拒绝别的工具导出的 JSON（format 不匹配）", () => {
    const result = migrateImportedPayload({ format: "some-other-app", version: 1, data: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("不是本工具导出");
  });

  it("拒绝比当前程序更新的版本，而不是猜着读", () => {
    const result = migrateImportedPayload({
      format: "vibe-coding-2026/planner",
      version: 99,
      exportedAt: "2030-01-01T00:00:00.000Z",
      data: EMPTY_PAYLOAD,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("比当前程序");
  });

  it("兼容裸 tasks 数组的旧文件", () => {
    const result = migrateImportedPayload([task]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.snapshot).toBeNull();
  });

  it("结构不合法时给出字段路径", () => {
    const broken = { tasks: [{ title: "" }], snapshot: null };
    const result = migrateStoredPayload(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("tasks");
  });

  it("空值回落为空载荷而不是报错", () => {
    const result = migrateStoredPayload(null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(EMPTY_PAYLOAD);
  });

  it("兼容 zustand 的 { state, version } 包装", () => {
    const result = migrateStoredPayload({ state: { tasks: [task], snapshot: null }, version: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.tasks).toHaveLength(1);
  });
});

describe("存储适配器", () => {
  it("读写走同一份底层存储", () => {
    const kv = createMemoryStore();
    const adapter = createPlannerAdapter(() => kv);
    adapter.setItem("k", "v");
    expect(adapter.getItem("k")).toBe("v");
    adapter.removeItem("k");
    expect(adapter.getItem("k")).toBeNull();
    expect(adapter.available).toBe(true);
  });

  it("SSR / 浏览器禁用 localStorage 时返回 null 而不是崩溃", () => {
    const adapter = createPlannerAdapter(() => null);
    expect(adapter.kind).toBe("local");
    expect(adapter.getItem("k")).toBeNull();
    expect(() => adapter.setItem("k", "v")).not.toThrow();
    expect(adapter.available).toBe(false);
  });

  it("配额满不抛异常，只标记不可用", () => {
    const throwing = {
      getItem: () => null,
      setItem: () => {
        const error = new Error("quota");
        error.name = "QuotaExceededError";
        throw error;
      },
      removeItem: () => undefined,
    };
    const adapter = createPlannerAdapter(() => throwing);
    expect(() => adapter.setItem("k", "v")).not.toThrow();
    expect(adapter.available).toBe(false);
  });
});
