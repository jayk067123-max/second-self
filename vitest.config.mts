import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * 单测只覆盖「纯函数」层（src/domain、src/shared）与 AI 层的契约测试。
 * React 组件不在此配置内做快照测试，避免与 Next 构建链耦合。
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/shared/**", "src/ai/**"],
    },
  },
});
