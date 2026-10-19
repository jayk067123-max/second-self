# 第二自我 · second-self

作者：杨家凯（GitHub: jayk067123-max）

> 把散落在七个群和一堆截图里的时间重新收拢：它先替你找出冲突，再把一天重新排开，每一步都能反悔。

全国高校 Vibe Coding 开发挑战赛 · B 组（赛题方向 8：个人效能与数字分身）

**它不是什么**：不是日历。不做同步、不做提醒、不做账号。它只做三件别人不容易做对的事——**冲突可视化、方案对比、可回滚**。

<p align="center">
  <img src="docs/screenshots/tab-today.png" width="240" alt="今日：一句话结论 + 冲突就地标出">
  <img src="docs/screenshots/tab-capture.png" width="240" alt="随手记：粘贴 / 截图 / 手动新增 / 重传课表">
  <img src="docs/screenshots/tab-tasks.png" width="240" alt="任务：按标题、地点、原话搜索">
</p>

> 真实界面（375px 宽移动端，2026-10-18 录制）。左：今日页先给结论——「后天 21:00 两件事中间只有 0 分钟」，冲突直接标在时间旁；中：所有输入入口收在一页；右：可按**原话**搜索。四标签说明见技术文档 §2.8。

| 状态 | 说明 |
|---|---|
| ✅ 功能 | 四标签界面；粘贴与截图两路录入；缺信息一屏一问；4 类冲突检测；两套方案并排对比；接受与 3 秒内撤销；分身随勾选变化 |
| ✅ 质量门 | `npm run verify`（typecheck + lint + test）全绿；2026-10-19 21:55 干净副本实跑 **24 个测试文件 / 345 项全部通过**（HEAD `8ab752f`）。数字随开发变化，以 `npm test` 实际输出为准 |
| ✅ 可复现 | 干净副本 `npm ci` 45.2 秒、启动约 1 秒、首屏 3.0 秒（条件见文末「复现耗时」） |
| 🎬 演示视频 | B 站（链接待补）；分镜与字幕稿在 `03-演示视频/` |

---

## 0. 先看这里：没有 API Key 也能跑

本项目**不要求你准备任何密钥**。未配置 `LLM_API_KEY` 时自动进入 **demo 模式**，返回结构合法的固定响应，校验、重试、可视修复入口、落盘、渲染全链路照常走通。终端与界面都会显示 `[demo mode]` 标识，避免把 mock 误当成真实模型输出。

> **一条边界必须写清**：demo 模式覆盖的是**文本解析**；**图片解析需要真实模型 key**，无 key 时该入口（`/api/ai/parse-image`）会**明确失败并返回 422**，不会静默降级成假结果。明确失败比假装支持好——看到 422 表示「这条入口要配 key」，不是程序坏了。

填了 key 之后，同一套代码走真实模型，行为一致。

---

## 10 分钟极速复现

### 1. 环境要求

| 项 | 要求 | 说明 |
|---|---|---|
| Node.js | **≥ 22.11**（仓库 `.nvmrc` 锁 **24.14.0**） | `.npmrc` 未开 `engine-strict`，版本不符只警告不阻塞 |
| 包管理器 | npm 或 pnpm 任一 | `package-lock.json` 已随仓库提供 |
| 数据库 | **不需要** | 任务数据存浏览器 localStorage |
| 其他服务 | **不需要** | 无 Redis、无对象存储、无需注册任何账号 |

### 2. 安装与启动（唯一启动命令）

```bash
git clone https://github.com/jayk067123-max/second-self.git
cd second-self
npm ci && npm run dev
```

浏览器打开 <http://localhost:3000>。

> **关于提交身份，说明一句**：早期一批提交由本机自动化工具（脚本）代为提交，**提交内容全部由参赛者本人操作与确认**；最终提交前已统一为参赛者本人身份，`git log` 里可逐条核对。写在这里，是因为评委会看提交历史，与其让人猜，不如直接说清。

> `npm ci` 已在**干净副本**实测通过（2026-10-19 21:55，HEAD `8ab752f`，`git archive HEAD` 导出 168 个文件后 `added 408 packages`，耗时 **45.2 秒**）；`npm install` 亦可，两者等价（仓库内含 `package-lock.json`）。

> 环境变量**不是必填项**。想配就先复制模板（可选）：
> ```bash
> cp .env.example .env            # Windows PowerShell: Copy-Item .env.example .env
> ```

### 3. 环境变量（8 项，全部可留空）

| 变量 | 默认 | 必填 | 说明 |
|---|---|---|---|
| `PORT` | 3000 | 否 | 应用监听端口 |
| `APP_URL` | <http://localhost:3000> | 否 | 公开访问地址，本地开发用 |
| `LLM_BASE_URL` | 空 | 否 | OpenAI 兼容端点，如 `https://api.deepseek.com/v1` |
| `LLM_API_KEY` | 空 | 否 | **留空即 demo 模式** |
| `LLM_MODEL` | 空 | 否 | 模型名，随服务商填 |
| `AI_REQUEST_TIMEOUT_MS` | 30000 | 否 | 单次调用超时（毫秒） |
| `AI_MAX_RETRIES` | 3 | 否 | 结构化输出校验失败后的最大修复重试次数 |
| `AI_CIRCUIT_BREAKER_THRESHOLD` | 5 | 否 | 同会话连续失败多少次后熔断，转提示人工修正 |

**没有数据库配置项**——`.env.example` 里也不会有 `DATABASE_URL`，本项目不使用服务端数据库。

### 4. 验证清单：跑对了应该看到什么

- [ ] 终端无报错，服务起在 3000 端口
- [ ] 首页返回 HTTP 200，浏览器控制台无红色报错
- [ ] `curl http://localhost:3000/api/health` 返回 `200`，body 含 `"status":"ok"` 且 `"aiMode":"demo"`（未填 key 时）
- [ ] 界面能见到 `[demo mode]` 标识
- [ ] `npm run verify` 全绿（看到 `Tests  N passed` 全部通过即可；**不以固定数字为准**，用例数以 `npm test` 实际输出为准，冻结日再刷新一次）
- [ ] `npm run build` 通过

> 说明：`/api/health` 曾有两句与架构冲突的旧文案（`data.write` 提 SQLite、各层 note 写"业务实现待选题确认"）。**已于 `3404c96` 修正**；2026-10-19 21:53 实测返回 `data.write` = 「本机目录可写 · 数据存 localStorage（无服务端数据库）」，各层 note = 「该层入口已就位；职责边界见 ARCHITECTURE §2」。修复前后的对照记在技术文档 4.6。

### 5. 常见报错排查

| 现象 | 原因 | 处理 |
|---|---|---|
| 端口被占用 | 3000 已占用 | 改 `.env` 的 `PORT` 或关掉占用进程 |
| `npm i` 提示 engine 不匹配 | Node < 22.11 | 装 Node 24 LTS；本项目未开 `engine-strict`，通常是警告不阻塞 |
| 界面显示 `[demo mode]` | 没配 `LLM_API_KEY` | **正常现象，不是报错** |
| 数据刷新后消失 | 浏览器隐私模式 / 禁用了 localStorage | 换普通窗口；用「导出 JSON」备份 |
| `/api/health` 返回 `degraded` | 自检项未通过 | 看返回体里的 `checks` 哪一项 `ok:false` |

### 6. 演示与自检命令（可选，不影响复现门槛）

| 命令 | 用途 |
|---|---|
| `npm run parse -- docs/demo-fixtures/notice.txt` | 走一遍「文本 → 结构化任务」全链路，把 JSON 打到终端；无 key 时首行打印 `[demo mode]`，第二行打印 `[clock] dayKey=2026-10-19`（演示时钟，不读系统时间） |
| 界面「导入 JSON」→ `docs/demo-fixtures/demo-seed.json` | 导入 18 条演示数据（3 条冲突），用于看冲突检测、方案对比与「固定块被挪 0 条」 |
| `npm run verify` | typecheck + lint + test，提交前自检 |

> `docs/demo-fixtures/` 下的文件是**已冻结**的演示素材（见同目录 `FROZEN.md` 的字节与哈希），请勿修改；`04-排班混合-回归用.txt` 仅作回归测试，不用于演示。

---

## 演示素材（唯一来源：`docs/demo-fixtures/`）

| 素材 | 用途 | 说明 |
|---|---|---|
| `notice.txt` | 解析演示（粘贴 → 结构化） | 436 B / 8 行，7 条任务、0 硬冲突 |
| `demo-seed.json` | 冲突与方案演示（界面导入 JSON） | 18 条 / 3 冲突 / 9 locked |
| `08-新课表-重传用.txt` | **重传覆盖演示**（同一份课表的更新版：覆盖哪一份 → 摘要 新增/调走/删除） | **与 `notice.txt` 不同源**：一个是群通知，一个是课表；不得互相替代 |
| `04-排班混合-回归用.txt` | 回归测试专用（15 条 / 3 冲突） | **禁止入镜**，不出现在截图与视频 |

> 期望值一律以 `docs/demo-fixtures/EXPECTED-2026-10-19.md` 为准；素材 10-24 22:00 冻结。

## 主流程（功能落地后照此验证）

1. 粘贴一段群里带错别字和口语的通知 → 点 `解析这段话` → 任务卡生成，低置信字段黄框标出
2. 改错字段、补漏项 → 确认入库
3. 冲突检测：时间重叠 / 缓冲不足（含通勤）/ 单日超载 / DDL 前置不足，红色重叠带 + 冲突卡片
4. 点 `帮我重排` → 两套方案并排、差异高亮 → 选一套
5. 点 `回滚` → 时间轴退回上一版；今日视图看数字分身状态

> 以上 5 步在 demo 模式下同样可走通。

---

## 项目结构（六层）

```
src/
├─ app/      装配层：路由与页面组装，只接线，不写业务判断
├─ ui/       展示层：纯 props 组件，不 fetch、不读 env、不含算法
├─ domain/   业务逻辑层：纯函数 + zod 契约（冲突检测 / 重排校验 / 快照）
├─ data/     本地持久化适配层：StorageAdapter + localStorage（无服务端数据库）
├─ ai/       AI 编排层：四道闸（schema 校验 / 重试 / 降级 / 可视修复）
└─ shared/   常量、类型、无副作用工具
```

依赖方向：`app → 所有层`，`ui → domain/shared`，`domain` 不依赖任何层且内部禁用 `Date.now()` / `Math.random()`（时间与随机数由参数注入）。完整约束见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

---

## 文档索引

| 文档 | 内容 |
|---|---|
| [docs/选题定义书.md](docs/选题定义书.md) | 定位、三条红线、痛点、P0/P1/P2、明确不做 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 架构 v1.0 定稿：六层、四道闸、ADR 决策记录 |
| [docs/SPEC-冲突检测与重排交互.md](docs/SPEC-冲突检测与重排交互.md) | 冲突规则、重排交互细则 |
| [docs/prompts/INDEX.md](docs/prompts/INDEX.md) | 意图卡索引（研发过程可追溯） |
| [docs/VIDEO-SPEC.md](docs/VIDEO-SPEC.md) | 演示视频脚本 |

## 开发方式

本项目全程 AI 辅助编程，每一轮交互按「意图卡」记录在 `docs/prompts/`，提交信息统一带 `[prompt:NNN]`，与意图卡一一对应。质量门：`npm run verify`（typecheck + lint + test）。

## 复现耗时（干净副本实测，2026-10-19 · HEAD `8ab752f`）

> 测量方式：`git archive HEAD --format=zip` 导出干净副本（168 个文件，**不含工作区改动**）→ `npm ci` → `npm run dev`（端口 3100，避开本机已占用的 3000）→ 走主链路。条件与数字必须一起看。

**实测条件**：Windows 11 家庭版 · AMD Ryzen 9 7945HX（16 核 / 32 线程）· 15.7 GB 内存 · Node v24.14.0 / npm 11.9.0 · 有线网络 · **复用本机 npm 缓存**。

| # | 步骤 | 命令 | 耗时 |
|---|---|---|---|
| 1 | 取得源码 | `git archive HEAD --format=zip` + 解压（168 个文件） | < 1 秒 |
| 2 | 安装依赖 | `npm ci` | **45.2 秒**（`added 408 packages`） |
| 3 | 配置环境变量 | 无需配置 | **0 秒** |
| 4 | 启动服务 | `npm run dev` | 约 **1 秒**内可访问（`/api/health` 轮询第 2 次即 200） |
| 5 | 主链路 | `GET /api/health` | **0.03 秒**（200，`status:ok`、`aiMode:demo`） |
| 5 | 首屏 | `GET /` 首次 / 二次 | **2.98 秒**（含首屏编译） / 0.06 秒 |
| **必做合计 1→5** | | | **约 50 秒** |
| 6 | 自检（**非复现必需**） | `npm run verify` | **15.1 秒**，24 个测试文件 / 345 项全部通过 |

**结论（注意前提）**：在 16 核笔记本、**复用 npm 缓存**、无需配置环境变量的条件下，必做步骤总计约 **50 秒**。**首次安装（无 npm 缓存）预计 3–5 分钟**；冷缓存机器更慢属正常，不改变"≤10 分钟"这一结论。

> `npm run verify` 是自检项，**不计入**复现门槛。
>
> 上一次同口径测量（2026-10-18，HEAD `1d9a411`）为 `npm ci` 88.1 秒、首屏 4.3 秒。两次数字不同不是口径变了，而是本机缓存与 HEAD 规模不同——**任何复现数字都必须连条件一起读**。

## License

MIT，见 [LICENSE](LICENSE) 文件。允许任意使用、修改、再分发，保留版权声明即可。

第三方依赖各自的许可证以其自身声明为准（可用 `npm ls --all` 核对）；本项目界面截图均为本人运行截图，未使用外部素材库图片。
