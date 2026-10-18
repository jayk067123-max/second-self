# src/data —— 本地持久化适配层

## 一句话
**没有服务端数据库。** 任务是个人本地数据，`localStorage` 足够；这一层把"存在哪"抽象成接口，将来换 IndexedDB / Tauri fs / SQLite 只替换实现，上层不动。

## 为什么不用 SQLite（ADR-1，写进 docs/ARCHITECTURE.md §7）
- `better-sqlite3` 的预编译产物与 Node 版本、运行平台强绑定，版本不匹配时会回退到本地编译，那时才需要 node-gyp + Visual Studio Build Tools —— 在评委机器上属于**不可控失败**，是 10 分钟复现指南的头号杀手。
- B 的产品形态不需要服务端持久化，本地存储还能顺带讲"数据不出本机"的隐私卖点。
- 少一个原生模块，`npm ci` 与 `npm run dev` 在陌生机器上的成功率更高。

## 文件职责
- `storage.ts`：载荷契约（`PlannerPayloadSchema`）、导出信封（`format + version + exportedAt + data`）、序列化与文件名
- `local-adapter.ts`：`StorageAdapter` 实现（localStorage / 内存），SSR 安全，配额满或隐私模式只标记不可用、不抛异常
- `migrate.ts`：读取与导入的唯一入口，做版本升级与结构校验；**宁可报错也不猜着修数据**

## 边界
- 只在客户端运行，零网络调用，不读密钥
- 任何读取结果都要过 zod；失败回落到空状态，不让页面崩
- 导出文件带 `format: "vibe-coding-2026/planner"`，拒绝"随便一个 JSON 就导入"
