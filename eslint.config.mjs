import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

/**
 * ESLint 扁平配置（ESLint 9 + eslint-config-next 16）。
 * 分层铁律的"机器可查"版本 —— 依赖方向写错，lint 直接红。
 *
 * 六层（见 docs/ARCHITECTURE.md §2）：
 *   app → {ui, domain, data, ai}
 *   ui  → {domain, shared}
 *   store → {domain, data}
 *   domain → {shared}（纯函数，无 IO）
 *   data / ai 只被允许的调用方使用
 */
export default defineConfig([
  ...nextVitals,
  globalIgnores([".next/**", "node_modules/**", "coverage/**", "data/**", "next-env.d.ts"]),
  {
    // 展示层与业务逻辑层：不许直连数据访问层，更不许碰 AI 编排层
    files: ["src/ui/**/*.{ts,tsx}", "src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/data", "@/data/*"],
              message: "展示层/业务层不得直连持久化适配层；数据由 store 或 app 的 server 侧注入。",
            },
            {
              group: ["@/ai", "@/ai/*"],
              message: "AI 编排层只能在 server 侧调用；客户端请走 /api/ai/* 路由。",
            },
          ],
        },
      ],
    },
  },
  {
    // 状态层可以用持久化适配层，但仍然不许直接调模型
    files: ["src/store/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/ai", "@/ai/*"],
              message: "store 不发网络请求：AI 调用由组件发起，结果再交给 store。",
            },
          ],
        },
      ],
    },
  },
  {
    // 纯函数层不许碰 React / IO，也不许自己读时钟与随机数（ARCHITECTURE §2 铁律 3）
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-dom", "next/*"], message: "domain 层必须是纯函数，不许依赖 React/Next。" },
            { group: ["node:fs", "node:path", "fs", "path"], message: "domain 层没有 IO。" },
            {
              group: ["@/ui", "@/ui/*", "@/data", "@/data/*", "@/ai", "@/ai/*", "@/app", "@/app/*", "@/store", "@/store/*"],
              message: "domain 层不 import 任何其他层（铁律 3）。",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: "domain 层禁止 Date.now()：now 必须由调用方注入，否则单测不稳定（铁律 3）。",
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "domain 层禁止 new Date()：时间必须由调用方注入（铁律 3）。",
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: "domain 层禁止 Math.random()：随机数必须由调用方注入（铁律 3）。",
        },
      ],
    },
  },
]);
