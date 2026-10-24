# 展示与交互层

FinalPlanner是唯一三标签应用，TaskEditor处理编辑/删除/周期星期。composites复用录入、人工核对、重排、导入导出和自检；primitives统一基础控件。

正式数据只通过data/store读写；录入请求在intakeClient，重排通过API，密钥不进入客户端。domain函数负责规则与校验。旧四标签组件已移除，不保留第二款应用。
