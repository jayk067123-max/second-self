# src/ai —— AI 编排层

## 职责
把「模型」当成不可信外部输入源来管：组装 prompt、发起调用、校验输出、修复重试、降级。

## 允许依赖
- `openai`（官方 SDK，`LLM_BASE_URL` 可指向任意 OpenAI 兼容端点）
- `zod`、`src/domain`（契约的唯一来源）
- `src/shared`

## 禁止
- 禁止被客户端组件 import；密钥只在 server 侧读取
- 禁止 `NEXT_PUBLIC_*` 里出现任何模型密钥
- 禁止把模型返回内容交给 `dangerouslySetInnerHTML`
- 禁止「解析失败就当成功」：必须走四道闸

## 四道闸（骨架第 5 步落地）
1. **Schema First**：先写 zod 契约，再由契约生成注入 prompt 的 JSON 结构描述
2. **强制 JSON + 硬校验**：`response_format: json_object` → `JSON.parse` → `safeParse`
3. **分级修复重试**（≤3 次）：回灌 `issues` → 降温/拆分任务 → 熔断并返回 `needs_repair`
4. **可视修复入口**：前端展示原始输出与失败字段，可一键重试或手工修正

## 降级
未配置 `LLM_API_KEY` 时自动进入 `demo` 模式：返回结构合法的固定响应，全链路照常走通。
这条保证了「评委零密钥也能在 10 分钟内看到完整产品流程」。

**但图片路径是例外**：demo 模式没有多模态能力，`parseTasksFromImage` 直接返回
`ok:false` + 可读原因（"请把图里的文字打一句话发我"），绝不返回固定假任务。
理由：假成功比失败更伤——用户会以为图里的内容已经进去了。

## 两条录入路径（同一份契约）
| 路径 | 入口 | 输入 | 完整性校验 |
|---|---|---|---|
| 文本 | `POST /api/ai/parse-tasks` | 粘贴原文 | `domain/completeness.checkCoverage` 用原文逐行重算（`verified:true`） |
| 图片 | `POST /api/ai/parse-image` | base64 data URL（长边 1400px，客户端压好再传） | `unverifiedCoverage`（`verified:false`，本地没有原文可复核） |

两条路径共用 `AiParseOutputSchema`、`validateDrafts`（逐条再过 Draft 契约）与重试逻辑，
差别只在消息体（多模态消息见 `guarded.ts` 的 `imageDataUrl`）与完整性校验方式。

## 完整性（`domain/completeness.ts`）
解析是概率行为，模型可能跳过某一行而不报错。所以服务端**不采信模型自述**，
拿原文重算一遍：每行要么有归属、要么进 `coverage.uncovered`（前端「没看懂，请你确认」），
要么是纯日期/星期上下文。漏一行 DDL 比解析错更严重 —— 解析错能改，漏掉发现不了。
