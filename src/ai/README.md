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
