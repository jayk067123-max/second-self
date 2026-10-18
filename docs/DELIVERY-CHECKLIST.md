# 远端仓库与提交前检查清单

> 维护人：交付官。全队唯一执行 `git commit` / `git push` 的角色。
> 其他 Bot 改完文件通知交付官，由交付官提交，禁止各自 commit。
> **两个硬节点**：预指导 2026-10-31 15:00（每人仅一次）／省赛最终 2026-11-18。对应双节点清单见 §六。

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

- 凭据一律走**安全卡片**：用户把 token 填进卡片，值只以环境变量形式进入命令行（名义变量名 `GITHUB_TOKEN`；经 DSH 安全卡片注入时实际读取 `$env:DSH_SECRET_GITHUB_TOKEN`），**对话里不出现明文**。
- 推送写法：**一次性内联地址**，用完即弃
  ```bash
  git push "https://<用户名>:${env:GITHUB_TOKEN}@github.com/<用户名>/vibe-coding-2026.git" main
  ```
- **禁止**：`git remote add/set-url` 把带 token 的地址写进 `.git/config`（虽然不在提交里，但 token 会明文落盘在本地配置里，属于污染）。
- **禁止**：`git config credential.helper store`（token 明文存 `~/.git-credentials`）、把 token 写进 `.env` / `README` / 任何配置文件、把 token 贴到聊天里。
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
- [ ] **全仓 grep 绝对路径零命中**：无 `C:\Users\…`、`C:/Users/`、`/home/`、`/Users/`（规则见 §七·绝对路径）
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
| 禁止 | `git add .` / `git add -A` 一把梭、`--force` 覆盖历史、把密钥写进提交 |

### 暂存区纪律（血的教训）

工作区里常年有别人未完成的改动，`git add -A` / `git add .` 会把它们一起卷进你的提交，造成"提交人和作者不一致"、也破坏了细粒度历史。

**规范动作，每次照做：**

```powershell
git add <具体文件路径>              # 只 add 本次负责的文件，逐个小步走
git status --short                  # 复核：暂存区（左列）只应有你该提交的东西
git diff --cached --name-only       # 再确认一次文件名清单
# 万一多加了，立刻撤出暂存区（保留工作区改动）：
git restore --staged <误加的文件>
```

真实案例：执行 `git add --renormalize .` 统一换行符时，把 Prompt官 正在改的 `docs/prompts/INDEX.md` 一起拉进了暂存区，靠 `git restore --staged` 才撤出来。**带 `.` 或 `-A` 的命令在这份清单里一律视为违规操作。**

## 六、双节点提交清单：10-31 预指导 / 11-18 最终

> **这是两个独立节点，不是一次提交。** 预指导提交比省赛最终提交早 18 天，且每人只能提交一次（没有改的机会）。预指导材料要求完整，最终提交在它基础上迭代。
> 验收人：主Bot。所有 `[ ]` 由交付官执行、主Bot 核对后勾选。

### 6.1 预指导提交表单（2026-10-31 15:00，金数据 `https://f.kdocs.cn/g/GZcCLbBV/`）

| # | 字段 | 内容 | 准备物 | 负责人 |
|---|---|---|---|---|
| 1 | UID | 2115240 | — | 交付官 |
| 2 | 姓名 | 杨家凯 | — | 交付官 |
| 3 | 您的学校 | 福州大学至诚学院 | — | 交付官 |
| 4 | 联系人手机号 | 只在提交表单时手工填写，**不落任何进仓库的文件**；凡可能含手机号的文件，提交前必须执行 §七 扫描拦截，命中即脱敏或拒绝提交 | 无（表单内填） | 用户 / 交付官 |
| 5 | 完整作品文件链接 | 作品文档 + 源码打包上传至百度/夸克/阿里云盘，填**长期有效或带提取码**的可访问链接 | `06-网盘交付包` | 交付官 |
| 6 | 作品介绍文档 | 单文件 **≤ 100MB** | `02-作品介绍文档` | 文档官 |
| 7 | 演示视频地址 | **禁止填网盘链接**，必须是 B站/抖音等公开视频平台的视频页链接 | `03-演示视频` | 映像官 |

### 6.2 双节点打勾表

| 提交物 | 10-31 预指导版验收标准 | 11-18 最终版验收标准 | 验收人 | 10-31 | 11-18 |
|---|---|---|---|---|---|
| GitHub/Gitee 仓库 | Public，无痕窗口可访问，含细粒度历史 | 同左，且历史完整可追溯全部迭代 | 主Bot | [ ] | [ ] |
| git 演进链路 | 至少有选题、骨架、功能一等真实模块提交，无「一把梭」大提交 | 全部模块各自独立提交，主流程可从头还原 | 主Bot | [ ] | [ ] |
| `docs/prompts/` Prompt 链 | ≥ 3 条完整链（我的 Prompt + AI 产出 + 我如何引导修 bug） | ≥ 3 条且补全后期迭代、修正过程 | Prompt官 / 主Bot | [ ] | [ ] |
| README 复现指南 | 10 分钟能跑起来：环境、依赖锁定版本、`npm i && npm run dev`、`.env` 模板 | 同左，且补上种子数据初始化步骤 | 全栈手 / 主Bot | [ ] | [ ] |
| 演示视频 | 5–8 分钟、1080P、**已上传 B站/抖音并通过无痕验证可播**，含 ≥2 分钟 AI 协同复现 | 可复用同一视频，或按评审意见迭代重传，链接同步更新 | 映像官 / 主Bot | [ ] | [ ] |
| 作品介绍文档 | 7 点齐全（项目详情与使用方式、亮点、AI 测试技术落地、关键技术、图片、是否发表获奖、是否基于他项目优化），单文件 ≤ 100MB | 按预指导反馈修订，内容与最终代码一致 | 文档官 / 主Bot | [ ] | [ ] |
| 技术文档 PDF | 初稿即可（意图控制策略、架构设计、可复现性论证） | **≤ 30 页**定稿 | 文档官 / 主Bot | [ ] | [ ] |
| 网盘交付包 | `06-网盘交付包` 打包上传，链接有效且带提取码 | 重新打包上传，链接更新并复查可访问 | 交付官 | [ ] | [ ] |
| 表单/平台提交 | 表单 7 项填完、截图留档（建议 10-30 完成，不卡 15:00） | 最终提交链接公布后按新入口提交，截图留档 | 交付官 | [ ] | [ ] |
| 材料可复用 | 所有成品文件集中存放，命名规范，第二次可直接复用迭代 | — | 交付官 | [ ] | [ ] |

### 6.3 `06-网盘交付包` 打包规范（交付官执行）

包内必须包含，且**只包含**这些：

1. `vibe-coding-2026-src.zip` —— 源码快照
   - **禁止**包含：`node_modules/`、`.env`（任何真实值）、`data/`、`dist/`、构建产物、原始录屏素材、`*.mp4`
   - 建议不含 `.git/`（历史在公开仓库里看得见）；**若仓库最终只能是私有**，必须额外附 `git bundle create vibe-coding-2026.bundle --all`，否则评委无法看到演进记录
   - ⚠️ **`git archive` 只打包已提交的内容**：工作区有未提交改动时，打出来的 zip 是旧版本且不会报错。打包前必须 `git status` 确认 **clean**，否则先提交再打包。
   - 打包命令（在仓库根目录）：
     ```powershell
     git status --short                                  # 必须无输出
     git rev-parse --short HEAD                          # 记下这个 hash
     git archive --format=zip -o "..\06-网盘交付包\vibe-coding-2026-src.zip" HEAD
     ```
     用 `git archive` 而不是手选目录，能自动排除未跟踪文件与 `.gitignore` 命中项。
2. `作品介绍文档.pdf`（或 .docx，单文件 ≤ 100MB）
3. `复现说明.txt` —— 三行话也要有：需要什么环境、怎么启动、没有 `.env` 时去哪拿模板（`cp .env.example .env`）。
   **第一行必须写源码版本**，让评委确认拿到的是哪一版：`源码版本：vibe-coding-2026 @ <git rev-parse --short HEAD 的输出>`
4. `演示视频链接.txt` —— B站/抖音视频页 URL + 视频简介（不放视频文件本身）

上传后再做一遍验收：无痕窗口打开网盘链接 → 能下载 → 解压后按 `复现说明.txt` 能跑起来。

### 6.4 演示视频发布规范（映像官执行，交付官验收）

- 平台：B站 / 抖音 / 优酷等**公开视频平台**，视频页可直接访问。**网盘链接一律不接受**。
- 规格：MP4、1920×1080、5–8 分钟，其中**≥ 2 分钟为「AI 协同过程复现展示」**。
- 可见性：必须"公开"，不能"仅自己可见""粉丝可见"或需要登录观看。
- 验收动作：退出登录 / 用无痕窗口打开链接 → 能播 → 右下角清晰度可切到 1080P → 链接填进表单第 7 项前再核对一次标题与作品名一致。

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

### 绝对路径（同属不合规，命中即拦截）

绝对路径有两个问题：暴露本机用户名（如 `C:\Users\<用户名>`），以及**评审在自己机器上照做时路径对不上**——后者直接扣「可复现性」分。

零命中的四种形式（跨平台都算违规）：

```powershell
# 全仓扫描，四条都要 0 命中
# 注意：本清单自身含有本节规则文本，会命中自己，所以排除 DELIVERY-CHECKLIST.md
git grep -n -E '[A-Za-z]:\\\\Users\\\\|[A-Za-z]:/Users/|/home/|/Users/' -- . ':(exclude)docs/DELIVERY-CHECKLIST.md'
git ls-files | Where-Object { $_ -ne 'docs/DELIVERY-CHECKLIST.md' } | ForEach-Object { Select-String -Path $_ -Pattern '[A-Za-z]:\\Users\\','[A-Za-z]:/Users/','/home/','/Users/' }
```

> 命中排除项以外的任何一行 = 不合规，必须改成相对路径后才能提交。`git grep` 只扫已跟踪文件，未跟踪的新文件用第二条命令补扫。

统一替换规范：

| 场景 | 写成什么 |
| --- | --- |
| 项目内文件/目录 | **相对仓库根的相对路径**，如 `docs/prompts/`、`fixtures/notice.txt`、`./data/app.db` |
| 交付总目录（仓库外的 00–06 目录） | 描述式：`桌面 DS-项目集 下的 03-演示视频`，不写盘符、不写用户名 |
| `.ps1` / `.bat` / `.sh` 脚本里的可执行路径 | 必须用 `$PSScriptRoot`、`%~dp0` 或相对路径，**不许硬编码绝对路径** |
| 示例数据、报错引用、日志片段 | 用 `<仓库根>/...` 或 `~/...` 占位，不填真实本机路径 |

历史里出现过的绝对路径**同样会留在 `git log -p` 中**，改文件不等于清历史。推送到远端前必须确认历史无命中：`git log --all -p | Select-String 'C:\\Users'`。

### 提交后复扫（每批必做，不只提交前）

**风险**：提交前你扫过一遍，提交后别人又改了工作区，下一批 `git add` 时可能把新的问题内容卷进去；或者提交本身把某个此前不在文件里的内容带了进来。所以扫描是**两个时点**，不是一次。

| 时点 | 扫什么 | 命令 |
| --- | --- | --- |
| 提交前 | 暂存区内容 | `git diff --cached` + 上面四类正则 |
| **提交后（新增）** | **刚提交进去的 blob** | `git show --stat HEAD`、`git show HEAD` + 同上四类正则 |

```powershell
# 提交后立即跑：直接扫刚入库的内容，绕开工作区干扰
git show HEAD | Select-String -Pattern '\b1[3-9]\d{9}\b|ghp_[A-Za-z0-9]{20,}|github_pat_|sk-[A-Za-z0-9]{20,}|[A-Za-z]:\\Users\\|/home/|/Users/'
# 无输出 = 通过；有输出 = 该提交含不合规内容，立刻报告，按 §七 处置
```

**为什么必须扫已提交的 blob 而不是工作区**：工作区随时被人改，扫它证明不了"库里是干净的"；只有 `git show HEAD` 才是评委实际会拿到的字节。

## 八、待推送记录（远端冻结期间）

远端仓库尚未建立（GitHub token 未到位），期间所有提交**只落本地**。细粒度历史在本地就成立，不影响「过程可复现性」得分；token 到位后一次性 `git push -u origin main` 推全部历史，一条都不丢。

**规则**：每完成一条提交，在此表追加一行。推送前执行 `git log --oneline --reverse` 与本表逐条核对，确认无遗漏、无多余。

| # | hash | 日期 | 提交信息 |
|---|---|---|---|
| 1 | `353871e` | 2026-10-18 | chore: 项目脚手架与协作规范 |
| 2 | `0675f04` | 2026-10-18 | chore: 提交纪律 - 补全 .gitignore 与交付检查清单 |
| 3 | `9a39f8a` | 2026-10-18 | docs: 更新赛事流程与预指导截止 2026-10-31 15:00 |
| 4 | `01dba4f` | 2026-10-18 | chore: 统一换行符为 LF，保证跨平台复现 |
| 5 | `9b11fb4` | 2026-10-18 | docs: 拆分预指导与最终提交双节点检查清单 |
| 6 | `2a002a6` | 2026-10-18 | docs: 固化演示视频录制与上传规范 |
| 7 | `4179824` | 2026-10-18 | chore: 提交纪律 - 禁止 git add -A 一把梭 |
| 8 | `4b21365` | 2026-10-18 | docs: 架构设计基线与四层分层说明 |
| 9 | `641c915` | 2026-10-18 | docs(prompts): 建立Prompt模板与留痕规范 |
| 10 | `363b85c` | 2026-10-18 | docs: 补充录制SOP与设备实测参数 |

> 本表截至上一条已提交记录；本节内容自身所在的提交、以及此后新增的每条提交，由交付官在下一轮回报时补入并在推送前统一核对。

**推送前必做**（token 到位后按序执行）：
1. `git remote add origin https://github.com/<用户名>/vibe-coding-2026.git`（地址里不带 token）
2. 设置提交身份为真实账号（见 §三）
3. `git ls-remote origin` 做连通性测试
4. `git push -u origin main`，推送地址用一次性内联 token 写法（见 §二）
5. 推送后 `git log --oneline origin/main` 与本地比对，条数与 hash 必须完全一致
