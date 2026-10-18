/**
 * 本地持久化适配层入口。
 *
 * 明确的边界：
 * 1. 本层**只在客户端运行**，没有服务端数据库，也没有任何网络调用；
 * 2. 对外只暴露「适配器 + 迁移 + 导出信封」三样东西，store 与 UI 不关心底层是 localStorage 还是别的；
 * 3. 任何读取都要过 zod，脏数据回落到空状态而不是让页面崩。
 */
export * from "./local-adapter";
export * from "./migrate";
export * from "./storage";
