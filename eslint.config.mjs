import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

/**
 * ESLint 扁平配置（ESLint 9 + eslint-config-next 16）。
 * 分层铁律的"机器可查"版本，后续可加 no-restricted-imports 强制依赖方向。
 */
export default defineConfig([
  ...nextVitals,
  globalIgnores([".next/**", "node_modules/**", "coverage/**", "data/**", "next-env.d.ts"]),
  {
    rules: {
      // 分层边界：展示层与纯函数层不得直连数据访问层
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/data/*", "../data/*", "../../data/*"],
              message: "数据访问层只能被 src/app 的 server 侧调用；UI/domain 请通过 props 或 service 接收数据。",
            },
          ],
        },
      ],
    },
  },
]);
