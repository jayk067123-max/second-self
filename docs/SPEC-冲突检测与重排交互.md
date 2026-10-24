# 冲突与重排：当前实现索引

2026-10-24。当前契约以src/domain/schemas/task.ts与src/domain/schemas/conflict.ts为准，完整设计见ARCHITECTURE.md；本文件不另维护第二份字段定义。

四类规则：overlap、buffer、overload、deadline。时间区间半开；周期按检测窗口与学期设置展开；已完成的周期实例按天排除。

重排入口接收所选日期、now、全量任务与学期。模型和本地算法产出候选，都经planGuard校验；固定、周期、已完成任务不得自动移动，不入过去，遵守截止和日容量，并检查目的日周期冲突。采纳前校验输入指纹和当前约束，成功后统一快照写入，可单步撤销。

检测入口src/domain/conflicts.ts；周期入口time.ts；候选与指标reflow.ts；共同护栏planGuard.ts。边界回归见tests/domain/final-integration.test.ts及原有domain测试。

规则参数不是健康建议；保守启发式不保证全局最优；周期单次例外与跨时区尚不支持。
