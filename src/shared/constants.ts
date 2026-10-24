/** 应用级常量 —— 只放与选题无关的元信息 */
export const APP_NAME = "第二自我";
export const APP_SUBTITLE = "校园日程与冲突规划助手";
export const APP_VERSION = "1.0.0";

/**
 * 六层架构的唯一定义源：/api/health 与落地页共用，避免两处描述漂移。
 * 口径：立项时口述为「四层」（路由/展示/业务/数据），落盘后 ai 独立成层、
 * shared 为横切目录，实际为六层。文档、视频、答辩统一称「六层目录结构」。
 */
export const ARCHITECTURE_LAYERS = [
  {
    key: "app",
    label: "装配层 App",
    path: "src/app",
    boundary: "路由与页面组装，只做接线，不写业务判断；API 路由是唯一出网口",
  },
  {
    key: "ui",
    label: "展示层 UI",
    path: "src/ui",
    boundary: "纯 props 组件，不 fetch、不读 env、不含算法",
  },
  {
    key: "domain",
    label: "业务逻辑层 Domain",
    path: "src/domain",
    boundary: "纯函数 + zod schema，无 IO、无 React，禁止 Date.now()/Math.random()，可单测",
  },
  {
    key: "data",
    label: "持久化适配层 Data",
    path: "src/data",
    boundary: "本地持久化适配层（StorageAdapter + localStorage），仅 client 侧，无服务端数据库",
  },
  {
    key: "ai",
    label: "AI 编排层 AI",
    path: "src/ai",
    boundary: "prompt 组装 / 硬校验 / 分级重试 / 降级，仅 server 侧，密钥不出服务端",
  },
  {
    key: "shared",
    label: "共享层 Shared",
    path: "src/shared",
    boundary: "常量、类型、无副作用工具，不依赖任何其他层",
  },
] as const;

export type LayerKey = (typeof ARCHITECTURE_LAYERS)[number]["key"];

/**
 * 演示时钟（DEMO_NOW）。
 *
 * 为什么要有它：演示素材里写的是「这周六」「下周三」「本月底」这类相对表述，
 * 如果产品按系统时钟算，同一段素材在任何另一天跑出来的结果都不一样——
 * 录像、测试、评委复现三者会互相打架。
 *
 * 所以本项目的"今天"由这个常量注入，界面上也会显式标出「演示时钟」，
 * 让观众一眼看出时间基准是可控的、可复现的。
 */
export const DEMO_NOW_ISO = "2026-10-19T09:00:00+08:00";
/** 演示时钟对应的日期键（dayKey），供解析与冲突检测使用 */
export const DEMO_DAY_KEY = "2026-10-19";

/**
 * 学期第 1 周周一（演示口径）。
 *
 * 为什么是 2026-09-21：演示时钟 `DEMO_DAY_KEY = 2026-10-19` 要正好落在**第 5 周**，
 * 与素材 `08-新课表-重传用.txt` 的表头「第 5 周课表（更新版）」对齐——
 * 素材说第 5 周，界面上算出来也必须是第 5 周，否则演示自相矛盾。
 *
 * 为什么必须有它：`Task.repeat.weeks` 里的"第 K 周"是**学期周**，不是日历年周。
 * 没有开学日，`dayInWeekSpec` 无法判断某天是第几周，周次过滤会被整段跳过——
 * 表现就是"单测绿、真实调用不生效"（2026-10-18 评审 WO-03 实测确认）。
 */
export const TERM_START_DAY_KEY = "2026-09-21";
