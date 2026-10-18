# 演示素材（demo-fixtures）

> **版本戳**：最后变更 **2026-10-18 16:21（本机时钟）** · 变更人 **选题官** · 变更内容：写死三份素材口径 + 两条并行路径。
> 规矩：本目录任何文件改动，**必须同时更新这一行**；版本戳没变的，说明你拿到的是旧版。

> **口径（一句话一条，全队照此，不再讨论）**
> - `notice.txt` = **解析演示素材**（15 条、含【更正】归并），S3 镜头①用。
> - `demo-seed.json` = **冲突与方案演示数据**（18 条 / 3 冲突），S2 主画面用。
> - `04-排班混合-回归用.txt` = 与 `notice.txt` 同源、多注释头、**仅回归用、禁入镜**。
>
> **两条并行路径，各司其职**，不是主/备关系：
> `notice.txt` 负责证明"AI 能不能读脏文本"，`demo-seed.json` 负责证明"冲突检测与重排好不好用"。
>
> **状态：素材已定稿；解析器仍在修；EXPECTED 断言待 10-21 用真实输出验证。**
> 当前 `npm run parse`（demo mode）输出 24 条，与 `notice.txt` 期望的 15 条不符，属解析器缺陷，不是素材问题。在 10-21 比对通过前，任何文档都不得把 EXPECTED 描述为"已实测"。

## 一、两条并行路径

| 路径 | 文件 | 进入方式 | 验证什么 | 落在哪个镜头 |
|---|---|---|---|---|
| **解析路径** | `notice.txt`（2,141 字节 / 31 行，纯正文） | 用户手动粘贴 → `解析这段话` | 解析质量、更正归并、`needsReview` 标记是否诚实 | S3 镜头① |
| **冲突路径** | `demo-seed.json`（18 条任务 / 3 冲突） | 界面「导入 JSON」→ 确认 | 冲突检测、方案对比与差异高亮、`locked` 任务不被移动 | S2 主画面 |

- 两条路径的数据**互不覆盖、互不混用**；导入动作和旁白都保留在镜头里，不藏。
- 解析路径自己也会亮红标（`notice.txt` 解析后同样有 3 条冲突），但 S2 的冲突画面**统一用 `demo-seed.json`**，因为它的 `locked` 字段是手工设计的，能验证"固定课被挪 0 条"这个信任指标。

## 二、回归与补充

| 文件 | 角色 | 进录像 |
|---|---|---|
| `04-排班混合-回归用.txt` | 与 `notice.txt` **同源**（正文逐字节一致，仅多 5 行注释头），回归对照用 | ❌ 禁止 |
| `02-相对时间表达.txt` | 补充测试集：周期性、区间性、指代性 | ❌ |
| `03-DDL轰炸.txt` | 补充测试集：纯截止时间、三种日期写法 | ❌ |
| `EXPECTED-2026-10-19.md` | 期望结果表：旁白与单测的共同基准（**目标值，待验证**） | — |
| `variants/` | 解析歧义备选，映像官 维护，见第三节 | 仅换素材时 |

## 三、`variants/`（映像官 授权，已认领）

`variants/` 下两份备选（`A-相对时间歧义.txt`、`B-条件顺延歧义.txt`）由映像官 放入，**不是演示主素材、默认不进录像**。它们的用途只有一个：10-22 复核时若发现 `notice.txt` 的翻车点不复现（解析器被修好了，一次全对），用来替换镜头① 的素材。

启用规则（四步必须全走）：映像官 决定 → **复制内容覆盖 `notice.txt`**（不许并存第二份，唯一路径原则不变）→ EXPECTED 整表重算 → 重跑 `npm run parse` 并把真实输出贴回分镜。

## 四、唯一路径原则（评审可见的硬规矩）

- `notice.txt` 在**全仓只有一个路径**：`docs/demo-fixtures/notice.txt`。
- 仓库根 `fixtures/` 已删除，**不保留任何副本目录**；`npm run parse` 统一读 `docs/demo-fixtures/notice.txt`。
- 任何文档、脚本、测试只能引用该路径，**禁止复制出第二份**。理由：仓库里出现两份内容相同的文件，git 会存成两个独立 blob，clone 到别人机器上就是两份会各自变旧的副本。
- 唯一性靠"只有一处"，不靠任何文件系统技巧。发现第二份副本，按 bug 处理。

## 五、时间政策（不可协商）

```
DEMO_NOW = 2026-10-19T09:00:00+08:00
```

- 解析、冲突检测、重排、单测、录像**全部**用它；代码里禁止以 `Date.now()` / `new Date()` 作默认时钟。
- 录制日是 10-27。主素材里有大量硬写日期（10月20日/21日/22日/23日/24日/25日/26日），跑系统时间会整体错位一周，且"本周三（10月21日）"这类相对词会与明写日期打架，画面一眼假。逐条证据见 EXPECTED 第六节。
- 换素材或换时钟 → EXPECTED 整表重算，不许只改几个数字。

## 六、换算规则（以 DEMO_NOW = 2026-10-19 周一为基准）

- 本周 = 10-19 ～ 10-25；下周 = 10-26 ～ 11-01；下下周 = 11-02 起
- 本周三 = 10-21；下周三 = 10-28；这周六 = 10-24；下周一 = 10-26；本月底 = 10-31
- 无具体时刻的截止 → 当日 `23:59`；`24:00` 归一化为次日 `00:00`
- **只给开始时间、未给结束 → 默认 90 分钟，并置 `needsReview: true`**（全项目统一，禁止一处 60 一处 90）
- 相对词与文内明写日期冲突时：以**明写日期**为准，并置 `needsReview: true`
- 字段名只允许 `needsReview`；早期草案里的那个别名已弃用，任何别名一律按 bug 处理（schema 字段不能有两个名字）

## 七、导入 JSON 的字段契约（`demo-seed.json`）

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

- `locked: true`（9 条）= 固定课/固定排班，**任何方案不得移动**；卡片的"固定课被挪 0 条"由它计算，非 0 即方案作废；
- `flexible: true` = 可顺延/可压缩，影响冲突降档与缓冲判定；
- `deadline` 非空且 `date` 为 `null` 的是纯截止任务，只参与规则 4。

## 八、提交前校验（交付官必跑）

```powershell
# 1) 主素材：2141 字节 / 31 行
(Get-Item docs\demo-fixtures\notice.txt).Length
(Get-Content docs\demo-fixtures\notice.txt).Count

# 2) 04 与 notice 的正文逐字节一致（跳过 04 的前 6 行头部）
$a = (Get-Content docs\demo-fixtures\notice.txt -Raw)
$b = ((Get-Content docs\demo-fixtures\04-排班混合-回归用.txt) | Select-Object -Skip 6) -join "`n"
$a.TrimEnd() -ceq $b.TrimEnd()

# 3) seed 合法，18 条任务 / 3 条冲突
$j = Get-Content docs\demo-fixtures\demo-seed.json -Raw | ConvertFrom-Json
$j.tasks.Count; $j.expectedConflicts.Count

# 4) 不允许存在第二套路径；字段名不许回潮
Test-Path fixtures                                   # 必须 False
Select-String docs\demo-fixtures\*.json -Pattern ('needs'+'Confirmation')   # 必须 0 条（只查数据/schema）
```

## 九、作废记录

- 旧版 `notice.txt`（7 条 / 436 字节 / 0 冲突）：已作废，被 15 条那版正文覆盖；
- 映像官 分镜附录 A 自带的 `notice.txt`：已作废，改为引用本目录文件；
- 仓库根 `fixtures/`：已删除，不再保留副本。

## 十、附：本机一次性的操作记录（不作为仓库机制）

开发期曾在本机用 NTFS 硬链接让两个路径共享 inode 避免误改。**该做法随仓库提交即失效**：git 只存内容，clone 出来是两份独立副本。正式机制是第四节的"唯一路径 + 禁止副本"，硬链接只是本机临时便利，任何文档不得写成一惯性保证。
