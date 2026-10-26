import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

/** 本地字体不依赖构建期外网；显式根目录避免上级锁文件干扰。
 * 账号数据由Node内置SQLite保存在服务端，无额外原生数据库包。
 */
// 校园日程采用北京时间，避免部署默认 UTC 导致服务端日期偏移。
process.env.TZ = "Asia/Shanghai";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 隐藏开发浮标；错误仍在终端和健康接口报告。
  devIndicators: false,
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
};

export default nextConfig;
