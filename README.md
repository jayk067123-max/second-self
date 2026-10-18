# 项目代号：待定（选题筛选中）

全国高校 Vibe Coding 开发挑战赛 · B 组参赛作品。

> 一句话定位：待选题确定后填写。

## 10 分钟极速复现指南

> 本节由文档官在功能定稿后完善，必须让评委从零到跑通 ≤ 10 分钟。

### 1. 环境要求

- Node.js ≥ 20（当前开发环境 v24）
- Git
- 可选：Python ≥ 3.11（若后端使用 FastAPI）

### 2. 安装依赖

```bash
npm install
```

### 3. 环境变量

```bash
# 复制模板
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
```

然后按 `.env.example` 内注释填写，**任何真实密钥都不得提交到仓库**。

### 4. 启动

```bash
npm run dev
```

浏览器打开 `http://localhost:3000`。

### 5. 验证清单

- [ ] 首页正常渲染，无控制台报错
- [ ] 核心功能主流程可走通（待功能确定后细化）
- [ ] 未配置 API Key 时有友好的降级提示，而非白屏

### 6. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 启动报端口占用 | 3000 被占用 | 修改 `.env` 中 `PORT` |
| 提示缺少 API Key | 未创建 `.env` | 按第 3 步复制并填写 |

## 项目文档

- 协作分工：[docs/TEAM.md](docs/TEAM.md)
- Prompt 快照索引：[docs/prompts/INDEX.md](docs/prompts/INDEX.md)

## 开发过程说明

本项目全程由 AI 辅助编程完成，开发链路可复现：
1. 每轮与 AI 的交互按「意图卡」记录，归档在 `docs/prompts/`；
2. 每次提交对应一个功能模块或一次 AI 协同，提交信息注明本轮引导目标；
3. 严禁一次性提交全部功能。

## License

待定。
