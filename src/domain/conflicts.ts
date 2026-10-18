import { z } from "zod";
import {
  DEFAULT_DETECT_CONFIG,
  type Conflict,
  type ConflictType,
  type DetectConfig,
  type Severity,
  isCrossCampusLocation,
  isVirtualLocation,
} from "./schemas/conflict";
import { priorityBandOf, type Task } from "./schemas/task";
import {
  MS_DAY,
  MS_MINUTE,
  dayKeyOf,
  expandOccurrences,
  formatClock,
  formatDuration,
  minutesFromLocalMidnight,
  parseIsoToMs,
  startOfLocalDay,
  weekdayLabel,
} from "./time";

export {
  CONFLICT_RULE_VERSION,
  CROSS_CAMPUS_TAGS,
  ConflictSchema,
  ConflictTypeSchema,
  DEFAULT_DETECT_CONFIG,
  DetectConfigSchema,
  SeveritySchema,
  VIRTUAL_VENUE_TAGS,
  isCrossCampusLocation,
  isVirtualLocation,
} from "./schemas/conflict";
export type { Conflict, ConflictType, DetectConfig, Severity } from "./schemas/conflict";

/**
 * 冲突检测 —— 全本地、全纯函数、断网可用。
 *
 * 三条不可协商的约定（对应 ARCHITECTURE §0 与 SPEC §A）：
 * 1. `now` 由参数注入，函数内不出现 `Date.now()` / `new Date()`（无参形式）。
 *    同一份 tasks + config + now，输出逐字段稳定 —— 这是"可测"的证据。
 * 2. 区间一律半开 `[start, end)`：首尾相接（09:00–10:00 与 10:00–11:00）
 *    数学上交集为空，不报重叠；"零间隔赶场"这个真实痛点交给规则2缓冲不足。
 *    一条冲突只允许一个来源，同一件事绝不报两次。
 * 3. 已完成（done）任务不产生冲突，只在规则3里作为"时间已占用"参与用量计算；
 *    人已经做完的事再去提醒他撞车，是纯粹的噪音。
 */

const MINUTE = MS_MINUTE;

/** 微任务阈值：短于 15 分钟且没有地点的安排（买饭、回消息），不占日容量 */
const MICRO_TASK_MIN = 15;

/**
 * locked 集中日的判定线：固定块占当日负荷一半以上即视为"不可抗"。
 *
 * 【本项目补充定义】SPEC 只写了"考试日/活动日等 locked 集中日，超载只出 medium"，
 * 没给"什么叫集中"。50% 这个判据是我们补的，已同步进 SPEC 并由主Bot 裁决采纳。
 * 补这条的理由：课表是学校排的，把它标成红点等于让用户去处理一件他处理不了的事；
 * 但没有判据就等于这条规则永远不生效，所以必须给一个可测、可解释的线。
 */
const LOCKED_CONCENTRATED_RATIO = 0.5;

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** 排序用的类型固定序：重叠最强，其次缓冲，再是超载与截止 */
const TYPE_RANK: Record<ConflictType, number> = {
  overlap: 0,
  buffer: 1,
  overload: 2,
  deadline: 3,
};

/** 降一档：high→medium→low。用于"可协商的占用"与"信息不足"两类降级 */
function downgrade(severity: Severity): Severity {
  if (severity === "high") return "medium";
  return "low";
}

// ─────────────────────────────────────────────────────────────
// 时间块抽取与按天切分（规则1/2/3 共用）
// ─────────────────────────────────────────────────────────────

export interface TimedTask {
  task: Task;
  startMs: number;
  endMs: number;
}

/**
 * 一次"发生"：可能是任务本身，也可能是重复任务在窗口内展开出的一段。
 *
 * 为什么要单独有这个类型：重复任务在数据里只有一行，但它会撞上不止一次
 * （下周二撞、下下周二还撞）。冲突卡片必须能区分"哪一次的撞车"，
 * 所以 `repeated` 用来决定 conflictId 是否带上发生日期 —— 否则同一对任务
 * 在不同周的两条冲突会拿到同一个 id，被去重逻辑静默吞掉一条。
 */
export interface Occurrence extends TimedTask {
  repeated: boolean;
}

/**
 * 把任务集合展开成"发生序列"。
 * 单次任务原样保留（不按窗口剪，见 expandOccurrences 的注释）；
 * 重复任务只在 [rangeStart, rangeEnd) 窗口内展开。
 */
function occurrencesOf(
  tasks: readonly Task[],
  rangeStartMs: number,
  rangeEndMs: number,
): Occurrence[] {
  const occurrences: Occurrence[] = [];
  for (const task of tasks) {
    if (task.repeat !== null) {
      const expanded = expandOccurrences(task, new Date(rangeStartMs), new Date(rangeEndMs));
      for (const occurrence of expanded) {
        const startMs = parseIsoToMs(occurrence.start);
        const endMs = parseIsoToMs(occurrence.end);
        if (startMs === null || endMs === null || endMs <= startMs) continue;
        occurrences.push({ task, startMs, endMs, repeated: true });
      }
      continue;
    }
    const startMs = parseIsoToMs(task.start);
    const endMs = parseIsoToMs(task.end);
    if (startMs === null || endMs === null || endMs <= startMs) continue;
    occurrences.push({ task, startMs, endMs, repeated: false });
  }
  return occurrences;
}

/**
 * 抽出所有「真的占时段」的任务：开始/结束都要能解析，且结束严格晚于开始。
 * 零时长任务（end === start）被排除 —— 它没有占用任何时刻，
 * 既不可能与别人重叠，也不该挤进日容量，只可能出现在规则4的截止提醒里。
 * 无具体时刻的任务（纯 DDL/备忘）同理排除。
 */
export function timedTasksOf(tasks: readonly Task[]): TimedTask[] {
  const result: TimedTask[] = [];
  for (const task of tasks) {
    const startMs = parseIsoToMs(task.start);
    const endMs = parseIsoToMs(task.end);
    if (startMs === null || endMs === null) continue;
    if (endMs <= startMs) continue;
    result.push({ task, startMs, endMs });
  }
  return result;
}

/**
 * 按本地日界 00:00 切分并累计占用分钟数（跨天任务两端分别计入各自日期）。
 * 例：22:00–01:00 → 当日 120 分钟 + 次日 60 分钟。
 * 这里不剔除微任务、不扣已完成：这是"时间轴上真的被占了多少"的原始量，
 * 数字分身、方案校验都直接用它；规则3要不要减、要不要剔，是规则自己的事。
 */
export function dailyTotals(timed: readonly TimedTask[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const { startMs, endMs } of timed) {
    for (const segment of splitByLocalDay(startMs, endMs)) {
      totals.set(segment.dayKey, (totals.get(segment.dayKey) ?? 0) + segment.minutes);
    }
  }
  return totals;
}

/** 某一天的已占用分钟数 */
export function minutesOnDay(tasks: readonly Task[], dayKey: string): number {
  return dailyTotals(timedTasksOf(tasks)).get(dayKey) ?? 0;
}

interface DaySegment {
  dayKey: string;
  startMs: number;
  minutes: number;
}

/** 把一个区间按本地零点切开，最多 3 段（单条任务上限 24 小时） */
function splitByLocalDay(startMs: number, endMs: number): DaySegment[] {
  const segments: DaySegment[] = [];
  let cursor = startMs;
  for (let guard = 0; guard < 3 && cursor < endMs; guard += 1) {
    const dayStart = startOfLocalDay(cursor);
    const segmentEnd = Math.min(endMs, dayStart + MS_DAY);
    const minutes = Math.round((segmentEnd - cursor) / MINUTE);
    if (minutes > 0) {
      segments.push({ dayKey: dayKeyOf(cursor), startMs: cursor, minutes });
    }
    cursor = segmentEnd;
  }
  return segments;
}

/**
 * 任务归属日：有时间块取开始日；纯 DDL 任务取截止日；都没有则 null（不归任何一天）。
 * 冲突卡片的 `date` 字段就用它，保证时间轴能定位到具体那一格。
 */
export function dayKeyOfTask(task: Task): string | null {
  const startMs = parseIsoToMs(task.start);
  if (startMs !== null) return dayKeyOf(startMs);
  const deadlineMs = parseIsoToMs(task.deadline);
  return deadlineMs !== null ? dayKeyOf(deadlineMs) : null;
}

/** 标题截断：humanMessage 有 40 字上限，长标题必须让位给数字锚点 */
function clipTitle(title: string, max = 10): string {
  return title.length <= max ? title : `${title.slice(0, max)}…`;
}

function isDone(task: Task): boolean {
  return task.done === true;
}

function isLocked(task: Task): boolean {
  return task.locked === true;
}

function isFlexible(task: Task): boolean {
  return task.flexible === true;
}

/** 两任务的占用是否"可协商"：一方可挪、另一方又不是固定块 */
function isNegotiable(a: Task, b: Task): boolean {
  return (isFlexible(a) && !isLocked(b)) || (isFlexible(b) && !isLocked(a));
}

// ─────────────────────────────────────────────────────────────
// 规则1 · 时间重叠（overlap）
// ─────────────────────────────────────────────────────────────

/**
 * 为什么按真实时间戳两两比较、而不是先按 `date` 分组：
 * 跨天段（22:00–01:00）与次日凌晨的段（00:30–01:30）在日历日上分属两天，
 * 按 date 分组会漏掉它们真实存在的重叠。半开区间在任何时区都自洽。
 */
function detectOverlaps(
  occurrences: readonly Occurrence[],
  config: DetectConfig,
  nowIso: string,
): Conflict[] {
  const conflicts: Conflict[] = [];
  for (let i = 0; i < occurrences.length; i += 1) {
    for (let j = i + 1; j < occurrences.length; j += 1) {
      const a = occurrences[i];
      const b = occurrences[j];
      if (!a || !b) continue;

      const overlapMs = Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs);
      // 半开区间：overlapMs === 0 即首尾相接，交集为空，不构成重叠
      if (overlapMs <= 0) continue;

      const overlapMin = Math.round(overlapMs / MINUTE);
      // 分钟是本系统的最小时刻粒度；不足半分钟的重叠在数据上不存在，
      // 若真出现（外部脏数据），视作同一分钟内相邻并交给规则2，避免刷出无意义红点
      if (overlapMin <= 0) continue;

      // 误报红线：同一父任务拆出的片段互相之间不报（拆课/分段排班是正常操作）
      const parentId = a.task.parentId ?? null;
      if (parentId !== null && parentId === (b.task.parentId ?? null)) continue;

      const durationAMin = Math.round((a.endMs - a.startMs) / MINUTE);
      const durationBMin = Math.round((b.endMs - b.startMs) / MINUTE);
      const shorterMin = Math.min(durationAMin, durationBMin);
      const containment = a.startMs <= b.startMs && a.endMs >= b.endMs;
      const containmentReverse = b.startMs <= a.startMs && b.endMs >= a.endMs;
      const isContainment = containment || containmentReverse;

      const severity = gradeOverlap({
        overlapMin,
        shorterMin,
        isContainment,
        bothLocked: isLocked(a.task) && isLocked(b.task),
        config,
      });

      const anchorMs = Math.max(a.startMs, b.startMs);
      const finalSeverity = isNegotiable(a.task, b.task) ? downgrade(severity) : severity;
      const dayKey = dayKeyOf(anchorMs);
      const clock = formatClock(anchorMs);
      const weekday = weekdayLabel(dayKey);

      const message = isContainment
        ? `${weekday} ${clock} 两件事完全重叠，你被安排了两次`
        : `${weekday} ${clock} 起两项安排重叠 ${overlapMin} 分钟`;

      conflicts.push(
        buildConflict({
          conflictType: "overlap",
          tasks: [a.task, b.task],
          severity: finalSeverity,
          message,
          date: dayKey,
          evidence: {
            overlapMin,
            durationAMin,
            durationBMin,
            thresholdMin: Math.round(0.6 * shorterMin),
            containment: isContainment ? 1 : 0,
            anchorMin: minutesFromLocalMidnight(anchorMs),
          },
          nowIso,
          // 重复任务会撞不止一次，id 带上发生日期，避免不同周的两条被当成同一条
          idSuffix: a.repeated || b.repeated ? `@${dayKey}` : "",
        }),
      );
    }
  }
  return conflicts;
}

/**
 * 重叠分级。
 * 这里有个 SPEC 内部矛盾要写清楚（也报给主Bot裁决了）：
 * 误报红线写"locked 双方都 true 才允许出 high"，但用例 A1-3（完全包含）期望 high，
 * 且两条任务通常都不是 locked。取法：完全包含一律 high ——
 * "一件事把另一件事整个盖住"在物理上没有可协商空间，与锁不锁无关；
 * 部分重叠的 high 则确实只在两个固定块硬碰硬时才给，符合红线的本意。
 */
function gradeOverlap(input: {
  overlapMin: number;
  shorterMin: number;
  isContainment: boolean;
  bothLocked: boolean;
  config: DetectConfig;
}): Severity {
  const { overlapMin, shorterMin, isContainment, bothLocked, config } = input;
  if (isContainment) return "high";
  if (bothLocked && overlapMin >= 0.6 * shorterMin) return "high";
  if (overlapMin > config.minOverlapMin) return "medium";
  return "low";
}

// ─────────────────────────────────────────────────────────────
// 规则2 · 缓冲不足（buffer）
// ─────────────────────────────────────────────────────────────

interface BufferCandidate {
  earlier: Occurrence;
  later: Occurrence;
}

/**
 * 候选对：同一本地日、按 start 排序后**相邻**的两条。
 * 为什么是相邻而不是两两：SPEC A2 就是"相邻"，而且两两比较会把
 * "A 之后隔了一条 B 再来 C"的 C 也算进 A 的缓冲，那是错的关系。
 * 已经重叠的相邻对由规则1负责，这里直接跳过 —— 一条冲突只能一个来源。
 */
function bufferCandidates(occurrences: readonly Occurrence[]): BufferCandidate[] {
  const sorted = [...occurrences].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const candidates: BufferCandidate[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const earlier = sorted[i - 1];
    const later = sorted[i];
    if (!earlier || !later) continue;
    // 夜间跨日不套用缓冲：22:00 之后接次日 08:00 前属于正常休整，
    // 用"通勤 30 分钟"去要求一段睡眠是荒谬的
    if (dayKeyOf(earlier.startMs) !== dayKeyOf(later.startMs)) continue;
    // 同一父任务的片段本质是同一件事被拆开显示，片段之间的间隙不是"赶场"
    const parentId = earlier.task.parentId ?? null;
    if (parentId !== null && parentId === (later.task.parentId ?? null)) continue;
    // 已经重叠的交给规则1
    if (later.startMs < earlier.endMs) continue;
    candidates.push({ earlier, later });
  }
  return candidates;
}

function detectBuffers(occurrences: readonly Occurrence[], config: DetectConfig, nowIso: string): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const { earlier, later } of bufferCandidates(occurrences)) {
    const a = earlier.task;
    const b = later.task;
    // 都能挪 → 不报：能自己调整的安排，提醒了也只是制造焦虑
    if (isFlexible(a) && isFlexible(b)) continue;

    const gapMin = Math.round((later.startMs - earlier.endMs) / MINUTE);
    const venue = resolveVenue(a, b, config);
    const requiredMin = venue.requiredMin;
    // 容差：差 2 分钟不算。过度敏感会把正常课间都刷成黄色
    if (gapMin >= requiredMin - config.gapMin.tolerance) continue;

    const severity = gradeBuffer({
      gapMin,
      requiredMin,
      venue,
      // 任一地点为空 = 信息不足，规则要求降档且不刷红
      locationUnknown: (a.location ?? null) === null || (b.location ?? null) === null,
    });
    const dayKey = dayKeyOf(earlier.endMs);
    const message = `${formatClock(earlier.endMs)} 结束接着 ${formatClock(later.startMs)} 开始，路上至少要 ${requiredMin} 分钟`;

    conflicts.push(
      buildConflict({
        conflictType: "buffer",
        tasks: [a, b],
        severity,
        message,
        date: dayKey,
        evidence: {
          gapMin,
          requiredMin,
          toleranceMin: config.gapMin.tolerance,
          venue: venue.kind,
          anchorMin: minutesFromLocalMidnight(earlier.endMs),
        },
        nowIso,
        idSuffix: earlier.repeated || later.repeated ? `@${dayKey}` : "",
      }),
    );
  }
  return conflicts;
}

interface Venue {
  kind: "same-venue" | "same-campus" | "cross-campus" | "virtual" | "unknown";
  requiredMin: number;
}

/**
 * 按地点表取所需间隔。
 *
 * 取值顺序是有讲究的，直接对着 demo-seed 的真实数据校过：
 * 1. **线上/远程**【本项目补充定义】优先判：线上会没有通勤成本，但也不该按
 *    "同一间屋子"的 10 分钟算，否则"21:00 线上会 → 21:30 线上会"会被刷成冲突；
 *    按默认 30 分钟保守处理。
 * 2. **跨校区/校外**：真实通勤成本，60 分钟（SPEC 原文）。
 * 3. **同一地点**：10 分钟（SPEC 原文）。
 * 4. **同校区不同楼**【本项目补充定义】（三教105 → 三教201）：校内步行十几分钟，
 *    给 20 分钟。SPEC 只有 同地点/跨校区/默认 三档，直接落到默认 30 会把
 *    seed 里 09:40→10:00 这种正常课间全刷成黄点。
 * 5. 其余（含任一地点为空）：默认 30 分钟，属于"信息不足"，判灰点。
 */
function resolveVenue(a: Task, b: Task, config: DetectConfig): Venue {
  const locA = a.location ?? null;
  const locB = b.location ?? null;
  if (isVirtualLocation(locA) || isVirtualLocation(locB)) {
    return { kind: "virtual", requiredMin: config.gapMin.default };
  }
  if (isCrossCampusLocation(locA) || isCrossCampusLocation(locB)) {
    return { kind: "cross-campus", requiredMin: config.gapMin.crossCampus };
  }
  if (locA !== null && locB !== null) {
    return locA === locB
      ? { kind: "same-venue", requiredMin: config.gapMin.sameVenue }
      : { kind: "same-campus", requiredMin: config.gapMin.sameCampus };
  }
  return { kind: "unknown", requiredMin: config.gapMin.default };
}

/**
 * 缓冲分级。
 * 同地点封顶 medium：10 分钟的要求本身极小，即使 gap=0 也只是"迟到 10 分钟"，
 * 不构成"基本来不及"。真正的"来不及"只发生在真实通勤成本（60 分钟）上。
 * 地点未知 → low：信息不足时宁可给灰点，不替用户假设"你来得及"或"你来不及"。
 */
function gradeBuffer(input: {
  gapMin: number;
  requiredMin: number;
  venue: Venue;
  locationUnknown: boolean;
}): Severity {
  const { gapMin, requiredMin, venue, locationUnknown } = input;
  if (locationUnknown) return "low";
  if (venue.kind === "same-venue") return "medium";
  return gapMin < 0.5 * requiredMin ? "high" : "medium";
}

// ─────────────────────────────────────────────────────────────
// 规则3 · 单日超载（overload）
// ─────────────────────────────────────────────────────────────

interface DayLoad {
  dayKey: string;
  /** 全天被占用的分钟数（含已完成，含 locked，不含微任务） */
  usedMin: number;
  /** 其中已完成的分钟数：人已经做完一部分，不该按全量指责他排太满 */
  doneMin: number;
  /** 其中固定块（locked）占掉的分钟数 */
  lockedMin: number;
  /** 当天出现过的任务 id（含已完成与微任务） */
  taskIds: string[];
}

function collectDayLoads(occurrences: readonly Occurrence[]): Map<string, DayLoad> {
  const days = new Map<string, DayLoad>();
  const ensure = (dayKey: string): DayLoad => {
    const existing = days.get(dayKey);
    if (existing) return existing;
    const created: DayLoad = { dayKey, usedMin: 0, doneMin: 0, lockedMin: 0, taskIds: [] };
    days.set(dayKey, created);
    return created;
  };

  for (const { task, startMs, endMs } of occurrences) {
    // 微任务不计：买饭、回消息这类碎片不是"任务负荷"，
    // 但前提是时长短**且**没有地点 —— 有地点的 10 分钟面谈仍要算
    const isMicro = task.durationMin < MICRO_TASK_MIN && (task.location ?? null) === null;

    for (const segment of splitByLocalDay(startMs, endMs)) {
      const load = ensure(segment.dayKey);
      if (!load.taskIds.includes(task.id)) load.taskIds.push(task.id);
      if (isMicro) continue;
      load.usedMin += segment.minutes;
      if (isDone(task)) load.doneMin += segment.minutes;
      if (isLocked(task)) load.lockedMin += segment.minutes;
    }
  }
  return days;
}

function detectOverloads(
  occurrences: readonly Occurrence[],
  tasks: readonly Task[],
  config: DetectConfig,
  nowIso: string,
): { conflicts: Conflict[]; highOverloadDays: Set<string> } {
  const conflicts: Conflict[] = [];
  const highOverloadDays = new Set<string>();
  const loads = collectDayLoads(occurrences);

  for (const load of [...loads.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey))) {
    // 任务数不足不判超载：两件事排满一天，那是充实，不是超载
    if (load.taskIds.length < config.overloadMinTasks) continue;

    const capacity = config.dayCapacityMin;
    // 已有 done 时按"剩余量"判定：已经完成的部分不重复计入压力
    const effectiveMin = load.usedMin - load.doneMin;
    const overMin = effectiveMin - capacity;
    const weekday = weekdayLabel(load.dayKey);

    if (overMin > 0) {
      const severity = gradeOverload(overMin, capacity, load);
      if (severity === "high") highOverloadDays.add(load.dayKey);
      const message = `${weekday}已排 ${formatDuration(effectiveMin)}，超出每天 ${formatDuration(capacity)} 上限 ${formatDuration(overMin)}`;
      const involved = tasksOnLoad(load, tasks);
      conflicts.push(
        buildConflict({
          conflictType: "overload",
          tasks: involved,
          severity,
          message,
          date: load.dayKey,
          evidence: {
            usedMin: load.usedMin,
            effectiveMin,
            capacityMin: capacity,
            overMin,
            taskCount: load.taskIds.length,
            doneOffsetMin: load.doneMin,
            lockedMin: load.lockedMin,
            anchorMin: 0,
          },
          nowIso,
          // 按天成立的冲突用日期当 id 键：任务进进出出不该让卡片 key 抖动
          idKey: load.dayKey,
        }),
      );
    }

    // 固定课满载预警：上限 10 小时之下还有一条 8 小时的"这段日子不轻松"提示线，
    // 与超载可并存（一天 8.5 小时课不算超载，但值得说一句）
    if (load.lockedMin > config.classLoadWarnMin) {
      const lockedTasks = tasksOnLoad(load, tasks).filter(isLocked);
      const message = `${weekday}固定课已占 ${formatDuration(load.lockedMin)}，超过 ${formatDuration(config.classLoadWarnMin)} 预警线`;
      conflicts.push(
        buildConflict({
          conflictType: "overload",
          tasks: lockedTasks,
          severity: "medium",
          message,
          date: load.dayKey,
          evidence: {
            trigger: "classLoad",
            classMin: load.lockedMin,
            warnMin: config.classLoadWarnMin,
            capacityMin: capacity,
            anchorMin: 0,
          },
          nowIso,
          idKey: load.dayKey,
          idSuffix: "#class",
        }),
      );
    }
  }

  return { conflicts, highOverloadDays };
}

/**
 * 超载分级：按"超出量占上限的百分比"分档，而不是绝对分钟数 ——
 * 上限可配（有人给自己定 8 小时），百分比分档才能跟着上限一起缩放。
 * locked 集中日（固定块占当日一半以上）只出 medium：课表是学校排的，
 * 把它标成红点等于让用户去处理一件他处理不了的事。
 */
function gradeOverload(overMin: number, capacity: number, load: DayLoad): Severity {
  const lockedConcentrated =
    load.lockedMin > 0 && load.usedMin > 0 && load.lockedMin / load.usedMin >= LOCKED_CONCENTRATED_RATIO;

  if (overMin > 0.25 * capacity) return lockedConcentrated ? "medium" : "high";
  if (overMin > 0.1 * capacity) return "medium";
  return "low";
}

/** 当日任务对象（用于 conflictId 与卡片 badge），按 id 排序保证稳定 */
function tasksOnLoad(load: DayLoad, tasks: readonly Task[]): Task[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return load.taskIds
    .map((id) => byId.get(id))
    .filter((task): task is Task => task !== undefined)
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ─────────────────────────────────────────────────────────────
// 规则4 · 截止日逼近（deadline）
// ─────────────────────────────────────────────────────────────

/**
 * 只有日期没有时刻的截止（'2026-10-26'）视为当日 23:59。
 * 为什么是 23:59 而不是 00:00：截止日是"那天结束前"，按 00:00 算会凭空
 * 提前一天报红，属于典型误报。
 */
export function parseDeadlineMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = parseIsoToMs(value);
  if (parsed === null) return null;
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  if (!isDateOnly) return parsed;
  const dayStart = startOfLocalDay(parsed);
  return dayStart + MS_DAY - MINUTE;
}

function detectDeadlines(
  tasks: readonly Task[],
  config: DetectConfig,
  nowMs: number,
  nowIso: string,
  highOverloadDays: ReadonlySet<string>,
): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const task of tasks) {
    // 已完成的任务不产生截止提醒
    if (isDone(task)) continue;
    const deadlineMs = parseDeadlineMs(task.deadline);
    if (deadlineMs === null) continue;

    const remainH = (deadlineMs - nowMs) / (60 * MINUTE);
    const estRemainMin = task.estateMin ?? task.durationMin;
    const estRemainH = estRemainMin / 60;
    const slackH = remainH - estRemainH;
    const band = priorityBandOf(task.priority);
    const leadHours = config.leadHours[band];
    const progress = task.progress ?? 0;

    let severity: Severity;
    let message: string;
    if (remainH < 0) {
      // 已逾期：已经发生的事实，比"可能排不下"严重
      severity = "high";
      message = `「${clipTitle(task.title)}」已逾期 ${formatDuration(-remainH * 60)}`;
    } else if (slackH < 0) {
      // 还剩的时间已经装不下这件事
      severity = "high";
      message = `「${clipTitle(task.title)}」还有 ${formatDays(remainH)}截止，但你已经排不下它了`;
    } else if (remainH < leadHours) {
      severity = "medium";
      message = `「${clipTitle(task.title)}」${formatDays(remainH)}截止，只剩 ${formatDuration(slackH * 60)} 可排`;
    } else {
      // 没进预警窗口：不报。不是漏报，是 SPEC 明确要求"提前预警窗口"之外不要打扰
      continue;
    }

    // 进度已高（≥0.8）的任务只留灰点：用户显然正在推进，红点只会打击人
    if (progress >= 0.8) severity = "low";

    const dateKey = dayKeyOf(deadlineMs);
    // 同一任务不同时刷两条红：当日已因超载刷红时，截止卡降为黄（信息合并）
    if (severity === "high" && highOverloadDays.has(dateKey)) severity = "medium";

    conflicts.push(
      buildConflict({
        conflictType: "deadline",
        tasks: [task],
        severity,
        message,
        date: dateKey,
        evidence: {
          remainH: round1(remainH),
          estRemainH: round1(estRemainH),
          slackH: round1(slackH),
          leadHours,
          priorityBand: band,
          progress: round1(progress),
          anchorMin: minutesFromLocalMidnight(deadlineMs),
        },
        nowIso,
      }),
    );
  }
  return conflicts;
}

/** 剩余时间的人话：不足一天说小时，超过一天说天 */
function formatDays(remainH: number): string {
  if (remainH < 24) return `${Math.max(1, Math.ceil(remainH))} 小时`;
  return `${Math.ceil(remainH / 24)} 天`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// ─────────────────────────────────────────────────────────────
// 统一构造、去重、排序
// ─────────────────────────────────────────────────────────────

/**
 * 统一出口：冲突的唯一构造点。
 * 之所以集中在一处构造，是为了保证 conflictId / ruleVersion / detectedAt
 * 三件事不可能被某条规则写歪 —— 排序与去重也才有可依赖的不变量。
 */
function buildConflict(input: {
  conflictType: ConflictType;
  tasks: readonly Task[];
  severity: Severity;
  message: string;
  date: string;
  evidence: Record<string, number | string>;
  nowIso: string;
  /**
   * 自定义 id 键。缺省用「排序后的任务 id 用 + 连起来」（SPEC §0.3 的口径）。
   * 按天成立的规则（超载）例外：用日期当键 —— 一屋子任务进进出出时，
   * id 跟着变会让前端的卡片 key 一直抖，而「周二超载」这件事本身是不变的。
   */
  idKey?: string;
  idSuffix?: string;
}): Conflict {
  const ids = input.tasks.map((task) => task.id).sort((a, b) => a.localeCompare(b));
  const suffix = input.idSuffix ?? "";
  const key = input.idKey ?? ids.join("+");
  return {
    conflictId: `${input.conflictType}:${key}${suffix}`,
    conflictType: input.conflictType,
    involvedTaskIds: ids,
    severity: input.severity,
    humanMessage: input.message,
    date: input.date,
    evidence: input.evidence,
    ruleVersion: "rules/v1",
    detectedAt: input.nowIso,
  };
}

/** 排序键：severity → date → 当天分钟锚点 → 类型固定序 → conflictId（兜底保证全序） */
function compareConflicts(a: Conflict, b: Conflict): number {
  const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (bySeverity !== 0) return bySeverity;
  const byDate = a.date.localeCompare(b.date);
  if (byDate !== 0) return byDate;
  const byAnchor = anchorOf(a) - anchorOf(b);
  if (byAnchor !== 0) return byAnchor;
  const byType = TYPE_RANK[a.conflictType] - TYPE_RANK[b.conflictType];
  if (byType !== 0) return byType;
  return a.conflictId.localeCompare(b.conflictId);
}

function anchorOf(conflict: Conflict): number {
  const anchor = conflict.evidence.anchorMin;
  return typeof anchor === "number" ? anchor : 0;
}

/**
 * 主入口。
 *
 * @param tasks  全部任务（含已完成；已完成只参与规则3的用量）
 * @param config 阈值全量可配，默认见 DEFAULT_DETECT_CONFIG
 * @param now    **必须由调用方注入**。函数内没有任何时钟读取，
 *               所以「同一输入三次运行结果一致」是可以直接写成单测的。
 */
export function detectConflicts(
  tasks: readonly Task[],
  config: DetectConfig,
  now: Date,
): Conflict[] {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new TypeError("detectConflicts 需要一个有效的 now（禁止隐式使用当前时间）");
  }
  const nowIso = now.toISOString();

  // 重复任务先展开成"发生序列"：数据里只有一行，判定时要看每一次发生。
  // 窗口从注入的 now 的本地零点起算，长 repeatHorizonDays 天 —— 全程没有系统时钟。
  const rangeStartMs = startOfLocalDay(nowMs);
  const rangeEndMs = rangeStartMs + config.repeatHorizonDays * MS_DAY;
  const occurrences = occurrencesOf(tasks, rangeStartMs, rangeEndMs);

  const overlaps = detectOverlaps(
    occurrences.filter((occurrence) => !occurrence.task.done),
    config,
    nowIso,
  );
  const buffers = detectBuffers(
    occurrences.filter((occurrence) => !occurrence.task.done),
    config,
    nowIso,
  );
  const { conflicts: overloads, highOverloadDays } = detectOverloads(
    occurrences,
    tasks,
    config,
    nowIso,
  );
  const deadlines = detectDeadlines(tasks, config, nowMs, nowIso, highOverloadDays);

  // 去重：bufferCandidates 已经跳过重叠对，正常路径下不会出现同一对任务
  // 同时进 overlap 与 buffer；这里再按 conflictId 兜一道，
  // 保证「一条冲突只有一个来源」这个不变量不被将来的改动破坏。
  const seen = new Set<string>();
  const all: Conflict[] = [];
  for (const conflict of [...overlaps, ...buffers, ...overloads, ...deadlines]) {
    if (seen.has(conflict.conflictId)) continue;
    seen.add(conflict.conflictId);
    all.push(conflict);
  }
  return all.sort(compareConflicts);
}

/** 冲突卡片折叠：展示前 maxCards 条，其余折成「另外 N 条」 */
export function foldConflicts(
  conflicts: readonly Conflict[],
  config: DetectConfig = DEFAULT_DETECT_CONFIG,
): { shown: Conflict[]; foldedCount: number } {
  const shown = conflicts.slice(0, config.maxCards);
  return { shown, foldedCount: Math.max(0, conflicts.length - shown.length) };
}

/** 冲突涉及的全部任务 id（UI 打红点用） */
export function conflictedTaskIds(conflicts: readonly Conflict[]): Set<string> {
  const ids = new Set<string>();
  for (const conflict of conflicts) {
    for (const id of conflict.involvedTaskIds) ids.add(id);
  }
  return ids;
}

/** 卡片右侧 badge 文案（同一任务多冲突时合并成一张卡） */
export const CONFLICT_TYPE_LABEL: Record<ConflictType, string> = {
  overlap: "重叠",
  buffer: "来不及",
  overload: "超时",
  deadline: "临近截止",
};

/** 一条冲突的人话（humanMessage 已在构造时生成，这里保留给 UI 统一取用） */
export function describeConflict(conflict: Conflict): string {
  return conflict.humanMessage;
}

// ─────────────────────────────────────────────────────────────
// 兼容层：planner.ts / avatar.ts 仍在用的旧参数形状
// ─────────────────────────────────────────────────────────────

/**
 * 旧配置形状只有两个数字（bufferMin / dailyLimitMin），
 * planner 与 avatar 用它算方案与分身状态。这里做成 DetectConfig 的投影，
 * 数字只有一份来源（默认值取 SPEC §0.4），不会出现两套默认值悄悄打架。
 *
 * 注意：新代码请直接用 DetectConfig；这两个导出只为不推翻既有调用方。
 */
export const ConflictOptionsSchema = z.object({
  bufferMin: z.number().int().min(0).max(120),
  dailyLimitMin: z.number().int().min(60).max(24 * 60),
});
export type ConflictOptions = z.infer<typeof ConflictOptionsSchema>;

export const DEFAULT_CONFLICT_OPTIONS: ConflictOptions = {
  bufferMin: DEFAULT_DETECT_CONFIG.gapMin.default,
  dailyLimitMin: DEFAULT_DETECT_CONFIG.dayCapacityMin,
};
