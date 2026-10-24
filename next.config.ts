import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

/**
 * Next.js 配置 —— 骨架阶段保持最小化。
 * 说明：
 * 1. 不使用 next/font/google 等构建期联网特性，保证弱网/离线环境 `npm run build` 依然成功。
 * 2. turbopack.root 显式指向本仓库：上级目录存在其他 lock 文件时，
 *    否则 Turbopack 会误判工作区根，导致构建不可复现。
 * 3. 无 serverExternalPackages：本项目不使用任何原生模块（已否决 better-sqlite3/drizzle），
 *    数据持久化走浏览器 localStorage 适配层，因此无需为原生依赖做打包例外。
 */
// 校园日程采用北京时间，避免部署默认 UTC 导致服务端日期偏移。
process.env.TZ = "Asia/Shanghai";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 开发态左下角的 Next 报错角标会出现在截图里（用户明确要求清掉）。
  // 关掉的是这个浮标，不是错误本身：真出错仍然会报在终端和 /api/health 上。
  devIndicators: false,
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
};

export default nextConfig;
