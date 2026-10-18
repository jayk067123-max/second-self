import { minutesOnDay } from "@/domain/conflicts";
import type { AvatarState, AvatarSummary } from "@/domain/avatar";
import type { Task } from "@/domain/schemas/task";
import { formatDuration } from "@/domain/time";

/**
 * 时间轴上的「负载占比」—— 只换算，不另算口径。
 *
 * 分身卡（`computeAvatarSummary`）当天占用分钟来自 `dailyTotals`：按本地零点切段累加
 * （22:00–01:00 当天算 120、次日算 60）。时间轴行级如果自己拿 `durationMin` 再算一遍，
 * 跨天任务就会一边 180 一边 120，出现「分身说超载、时间轴说没事」——这是逻辑手 指出的风险，
 * 也是"同一个数在两处长得不一样"最难解释的那类 bug。
 *
 * 所以行级调用的是**同一个** `minutesOnDay([task], dayKey)`：单条任务只是把同一套切段规则
 * 跑一次，逐行相加必然等于 `avatar.loadMin`。`tests/ui/dayLoad.test.ts` 有一条单测专门钉
 * 这个恒等式（含跨天、纯 DDL、零时长三种任务）。
 *
 * 本文件不做任何业务判定：不判冲突、不读时钟、不决定"能不能挪"。
 */

export interface DayLoadView {
  loadMin: number;
  limitMin: number;
  /** 0–1，上限为 0 时按 0 处理（与 avatar 的 resolveState 一致） */
  ratio: number;
  state: AvatarState;
  /** 0–100+，超过 100 时保留真实数字（如 117%），进度条宽度另行截断 */
  percent: number;
  /** 一句人话，给时间轴表头用 */
  label: string;
}

/** 分身卡的四个数 → 时间轴表头要的展示值（同一份数据，不重算） */
export function toDayLoad(
  summary: Pick<AvatarSummary, "loadMin" | "limitMin" | "loadRatio" | "state">,
): DayLoadView {
  const percent = Math.round(summary.loadRatio * 100);
  return {
    loadMin: summary.loadMin,
    limitMin: summary.limitMin,
    ratio: summary.loadRatio,
    state: summary.state,
    percent,
    label: `已排 ${formatDuration(summary.loadMin)} / 上限 ${formatDuration(summary.limitMin)} · ${percent}%`,
  };
}

export interface RowLoad {
  /** 该任务在**这一天**实际占用的分钟数（跨天任务只算当天那一段） */
  minutes: number;
  /** 排到这一行为止的累计占用（按时间轴显示顺序累加） */
  cumulativeMin: number;
  /**
   * 累计占上限的百分比（上限为 0 时为 0）。
   * 显示的是**累计**而不是单行占比：最后一行必然等于表头的总占比，
   * 单行占比四舍五入后相加与表头差几个点，反而会被问"两个数为啥不一样"。
   */
  cumulativePercent: number;
  /** 这一行是否把当天从「没超」推进到「超了」——时间轴上只标这一行 */
  crossesLimit: boolean;
}

/**
 * 逐行负载。入参必须是**时间轴显示顺序**（DayTimeline 排完序后传进来），
 * 累计值才有意义；返回值与入参一一对应。
 */
export function buildRowLoads(
  orderedTasks: readonly Task[],
  dayKey: string,
  limitMin: number,
): RowLoad[] {
  let cumulativeMin = 0;
  return orderedTasks.map((task) => {
    const minutes = minutesOnDay([task], dayKey);
    const before = cumulativeMin;
    cumulativeMin += minutes;
    return {
      minutes,
      cumulativeMin,
      cumulativePercent: limitMin === 0 ? 0 : Math.round((cumulativeMin / limitMin) * 100),
      crossesLimit:
        limitMin > 0 && minutes > 0 && before < limitMin && cumulativeMin >= limitMin,
    };
  });
}
