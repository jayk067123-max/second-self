# 演示素材（demo-fixtures）

> 两种数据两条路，**互不混用**。混用会导致"录像里出现摆拍"的质疑。

## 一、两条独立路径

| 路径 | 文件 | 进入方式 | 用途 | 承担哪个镜头 |
|---|---|---|---|---|
| **解析路径** | `notice.txt`（436 字节 / 8 行） | 用户手动粘贴 → 点「解析这段话」 | 证明 AI 能读脏文本 | 镜头① 粘贴解析、S3 里的 AI 协同段 |
| **导入路径** | `demo-seed.json`（18 条任务） | 界面「导入 JSON」→ 确认覆盖 | 证明冲突检测与重排 UI | 镜头② 冲突 → 三方案 → 落位 |

`notice.txt` **不产生硬冲突**（它只有截止任务，且都在 72 小时窗口外）；所以"周三 19:00 两个色块叠在一起"这个画面只能由 `demo-seed.json` 提供。
反过来说，也**不许**把预置任务塞进 `notice.txt`——那会让"真人粘贴解析"变成摆拍。

## 二、文件清单

| 文件 | 角色 | 进录像 |
|---|---|---|
| `notice.txt` | 主演示素材，与分镜附录 A 逐字节一致；无头部、纯正文 | ✅ |
| `demo-seed.json` | 演示初始状态数据集，含 18 条任务 + 期望冲突 + 三方案目标 | ✅（导入） |
| `02-相对时间表达.txt` | 补充测试集：周期性、区间性、指代性 | ❌ |
| `03-DDL轰炸.txt` | 补充测试集：纯截止时间、三种日期写法 | ❌ |
| `04-排班混合-回归用.txt` | 回归测试 + 复杂场景备用，**禁止出现在视频里** | ❌ |
| `EXPECTED-2026-10-19.md` | 期望结果表：旁白与单测的共同基准 | — |

## 二·五、唯一路径原则（评审可见的硬规矩）

- 主演示素材在**全仓只有一个路径**：`docs/demo-fixtures/notice.txt`。
- 仓库根 `fixtures/` 已删除，**不保留任何副本目录**；`npm run parse` 统一读 `docs/demo-fixtures/notice.txt`。
- 任何文档、脚本、测试若需要这份素材，**只能引用该路径**，禁止复制出第二份。理由：仓库里一旦出现两份内容相同的文件，git 会存成两个独立 blob，clone 到别人机器上就是两份会各自变旧的副本——评审看到的是"两套素材"，不是机制保证的一致性。
- 唯一性靠"只有一处"，不靠任何文件系统技巧。发现第二份副本，按 bug 处理。

## 三、时间政策（不可协商）

素材文本永久稳定；锚定时间不是"运行时 now"，而是注入的演示时钟：

```
DEMO_NOW = 2026-10-19T09:00:00+08:00
```

- 解析、冲突检测、重排、单测、录像**全部**用它；代码里禁止以 `Date.now()` / `new Date()` 作默认时钟。
- 录制日是 10-27，若跑系统时间：主素材里"这周六""下周一"会整体错位一周（"这周六"算成 10-31，而原文那件事在 10-24），画面上会出现"旁白说这周六、显示下周"的一眼假。逐条证据见期望表第五节。
- 换素材或换时钟 → 期望表整表重算，不许只改几个数字。

## 四、换算规则（以 DEMO_NOW = 2026-10-19 周一为基准，全队统一）

- 本周 = 10-19 ～ 10-25；下周 = 10-26 ～ 11-01；下下周 = 11-02 起
- 本周三 = 10-21；下周三 = 10-28；这周六 = 10-24；下周一 = 10-26；本月底 = 10-31
- 无具体时刻的截止 → 当日 `23:59`；`24:00` 归一化为次日 `00:00`
- **只给开始时间、未给结束时间 → 默认 90 分钟，并置 `needsReview: true`**（全项目统一值，禁止一处 60 一处 90）
- 相对词与文内明写日期冲突时：以**明写日期**为准，并置 `needsReview: true`

## 五、导入 JSON 的字段契约

```jsonc
{
  "seedVersion": "v1",
  "demoNow": "2026-10-19T09:00:00+08:00",
  "tasks": [ /* 18 条 */ ],
  "expectedConflicts": [ /* 3 条，供单测断言 */ ],
  "expectedProposalTargets": { "A": {}, "B": {}, "C": {} }
}
```

每条 Task：`id, title, date, start, end, durationMin, deadline, priority, location, locked, flexible, status, estateMin?`

- `locked: true` = 固定课/固定排班，**任何方案不得移动**；卡片的"固定课被挪 0 条"由它计算，非 0 即方案作废；
- `flexible: true` = 可顺延/可压缩，影响冲突降档与缓冲判定；
- `deadline` 为 `null` 的任务是纯截止任务（`date/start/end` 均为 `null`），只参与规则 4。

## 六、提交前校验（交付官必跑）

```powershell
# 1) notice.txt 必须是 436 字节、8 行
(Get-Item docs\demo-fixtures\notice.txt).Length
(Get-Content docs\demo-fixtures\notice.txt).Count

# 2) seed 必须是合法 JSON，且任务数 18、期望冲突 3
(Get-Content docs\demo-fixtures\demo-seed.json -Raw | ConvertFrom-Json).tasks.Count
(Get-Content docs\demo-fixtures\demo-seed.json -Raw | ConvertFrom-Json).expectedConflicts.Count

# 3) 不允许存在第二套路径
Test-Path fixtures        # 必须 False
```

## 七、作废记录

- 映像官 分镜附录 A 自带的 `notice.txt`：已作废，改为引用本目录 `notice.txt`；
- 仓库根 `fixtures/notice.txt`：**已删除，不再保留副本**；唯一路径为 `docs/demo-fixtures/notice.txt`；
- `01-课表与社团排班混合.txt`：已并入 `04-排班混合-回归用.txt`，不再单独存在。

## 八、附：本机一次性的操作记录（不作为仓库机制）

开发期曾在本机用 NTFS 硬链接让两个路径共享同一 inode，避免本机误改后不一致。**该做法随仓库提交后即失效**：git 只存文件内容，clone 出来是两份互不相关的副本。因此正式机制改为上文的"唯一路径 + 禁止副本"，硬链接仅作为个人本机的临时便利，任何文档都不得把它写成一惯性保证。
