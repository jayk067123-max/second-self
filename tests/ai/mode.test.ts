import { describe, expect, it } from "vitest";
import { resolveAiMode } from "@/ai";
import { cn } from "@/shared/utils";

describe("resolveAiMode", () => {
  it("未配置密钥时降级为 demo 模式", () => {
    expect(resolveAiMode(undefined)).toBe("demo");
    expect(resolveAiMode("")).toBe("demo");
    expect(resolveAiMode("   ")).toBe("demo");
  });

  it("配置了密钥时走 live", () => {
    expect(resolveAiMode("sk-anything")).toBe("live");
  });
});

describe("cn", () => {
  it("拼接并忽略假值", () => {
    expect(cn("a", undefined, false, "b")).toBe("a b");
  });
});
