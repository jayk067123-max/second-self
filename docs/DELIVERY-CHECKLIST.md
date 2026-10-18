# 远端仓库与提交前检查清单

> 维护人：交付官。全队唯一执行 `git commit` / `git push` 的角色。
> 其他 Bot 改完文件通知交付官，由交付官提交，禁止各自 commit。

## 一、远端仓库怎么配（Public）

### GitHub
1. 登录 GitHub → New repository → 名称 `vibe-coding-2026` → 可见性 **Public** → 不要勾选任何 Initialize（README/.gitignore/License 都不要，否则和本地历史打架）。
2. 绑定远程：
   ```bash
   git remote add origin https://github.com/<用户名>/vibe-coding-2026.git
   git push -u origin main
   ```
3. 如果组织/学校要求用 Gitee：流程相同，`origin` 换成 Gitee 地址。**一个 origin 就够**，不要同时配两个推送源导致历史分叉。

### 评估「Public 可访问」的标准
用无痕浏览器（未登录状态）打开仓库地址，能看到代码和 commit 历史才算通过。私有仓库即使给了评审链接也可能被判不可访问。

## 二、token 安全存放（绝不进仓库）

- 需要推送凭据时，交付官用 `request_secret` 发**安全卡片**，用户在卡片里输入 token，值只以环境变量形式进入命令行（`$env:DSH_SECRET_GITHUB_TOKEN`），**对话里不出现明文**。
- 使用方式：`git push https://x-access-token:$env:DSH_SECRET_GITHUB_TOKEN@github.com/...`，或先 `git remote set-url` 再用凭据管理器。
- **禁止**：把 token 写进 `.env` / `README` / 任何配置文件；把 token 贴到聊天里；用 `git config --local` 存凭据。
- **禁止**：`.env`、`*.key`、`secrets.json`、`.npmrc` 进仓库（`.gitignore` 已覆盖）。
- 万一 token 进过提交历史：立刻在平台吊销该 token，再考虑用 `git filter-repo` 清理历史；**不要 force push 覆盖别人的历史**，先报告。

## 三、首次 push 前必查（逐项打勾）

- [ ] `git status` 干净，无未预期文件
- [ ] `git log --stat` 里每个提交都是**单一模块**，无「一把梭」大提交
- [ ] 提交信息符合 `feat: <模块名> - <引导AI做了什么>` 格式
- [ ] 无 `node_modules` / `dist` / 构建产物 / 大二进制
- [ ] 无 `.env` / 密钥 / token（用 `git log -p -S "API_KEY"` 之类抽查一遍）
- [ ] 无原始录屏素材与 `.mp4`（视频走 Release 或提交平台）
- [ ] **已执行 §七 敏感信息扫描，提交内容无手机号 / 身份证 / 邮箱 / 密钥 / `.env` 内容**
- [ ] `docs/prompts/` 有编号快照，`INDEX.md` 里每条能对应到 commit
- [ ] README 含 10 分钟复现指南（环境、启动命令、依赖版本）
- [ ] `.gitignore` 与本次实际改动无冲突
- [ ] 分支名统一 `main`（已于首次 push 前从 `master` 改好）
- [ ] **【硬性】首次 push 前必须把 `user.name` / `user.email` 改成用户真实账号对应值**，否则提交无法关联到用户主页、评委看到的是一串"无主提交"：
  ```bash
  # GitHub：用 noreply 邮箱保护隐私，同时能正确关联主页
  git config user.name  "<用户显示名>"
  git config user.email "<用户名>@users.noreply.github.com"
  # Gitee：用注册邮箱
  git config user.name  "<用户显示名>"
  git config user.email "<Gitee 注册邮箱>"
  ```
  当前仓库身份是占位值 `Vibe Team <team@local>`，**上线前必须替换**。平台与账号确定后，由交付官执行。

## 四、种子数据规则（给全栈手）

`data/` 与 `*.db` 已被忽略（`.env.example` 里 `DATABASE_URL=file:./data/app.db`），这意味着**仓库里不会包含运行时数据库文件**。为了让别人 10 分钟能复现出有内容的应用：

- 需要初始数据时，全栈手把种子写成脚本放 **`seed/`** 目录，格式用 `.json` 或 `.sql`，例如 `seed/001-demo-data.sql`、`seed/items.json`。
- 提供一条初始化命令（如 `npm run seed`）写进 README 的复现指南，别人 clone 后跑一次就有数据。
- **禁止**把 `.db` 文件、`data/` 下的内容当作"数据交付"提交上来——那既不可维护，也会因体积被判不合规。

## 五、提交节奏（给全队的约定）

| 时机 | 动作 |
| --- | --- |
| 每个功能模块自测通过 | 交付官提交一次，信息带模块名 + 本轮 Prompt 编号 |
| 关键节点 | 打 tag：`v0.1-mvp`、`v0.5-prompt-complete`、`v1.0-submit` |
| 提交前 | 先 `git status` / `git diff --stat` 看改动，排除无关文件 |
| 禁止 | `git add .` 盲加、`--force` 覆盖历史、把密钥写进提交 |

## 六、最终提交物核对表（省赛 11-18 截止前逐项打勾）

- [ ] 仓库 Public，无痕可访问
- [ ] git 历史细粒度，可看出「引导 AI → 产出模块」的演进链路
- [ ] `docs/prompts/` ≥ 3 条完整 Prompt 链（含原始 Prompt、AI 产出、人工修正）
- [ ] README 含 10 分钟复现指南，他人可照做跑起来
- [ ] 演示视频 MP4，1080p，5–8 分钟
- [ ] 技术文档 PDF，≤ 30 页

## 七、提交前敏感信息扫描（硬规则）

**任何要进公开仓库的文件，提交前必须扫一遍：手机号（11 位）、身份证号、个人邮箱、API 密钥/token、`.env` 内容。** 一次误提交进了历史，清理成本比扫描高一个数量级。

标准动作（在仓库根目录执行）：

```powershell
# 1. 看这次到底改了什么，确认没有意外文件
git status --short
git diff --cached --stat

# 2. 扫暂存区内容：手机号 / 身份证 / 邮箱 / 密钥关键字
git diff --cached | Select-String -Pattern '\b1[3-9]\d{9}\b'
git diff --cached | Select-String -Pattern '\b[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])\d{2}\b'
git diff --cached | Select-String -Pattern '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
git diff --cached | Select-String -Pattern '(api[_-]?key|secret|token|password|passwd)\s*[:=]\s*\S+'
git diff --cached | Select-String -Pattern '(ghp_[A-Za-z0-9]{20,}|github_pat_|sk-[A-Za-z0-9]{20,})'

# 3. 扫文件名：密钥、环境变量、数据库、大二进制
git diff --cached --name-only | Select-String -Pattern '(\.env|\.key|\.pem|\.p12|\.db|\.sqlite|\.mp4|\.zip)$'
```

判定标准：
- 手机号、身份证、个人邮箱 → **脱敏后才提交**（如 `139****6598`、`y****@xx.com`），并在文件里注明"提交表单时按原值填写"。
- 命中密钥/token → **不提交**，改为读环境变量。
- 命中 `.env` 文件名 → 立刻 `git rm --cached`，把真实值移到本地 `.env`。

已知白名单（这些邮箱不算个人信息泄露）：`*@users.noreply.github.com`、`@example.com`、依赖锁文件里的包作者邮箱、`.env.example` 里的空值占位。扫描命中白名单时在回报里注明"已核对为白名单"即可通过。
