import {
  DEFAULT_CONFLICT_OPTIONS,
  DEFAULT_DETECT_CONFIG,
  dailyTotals,
  detectConflicts,
  timedTasksOf,
  type Conflict,
  type DetectConfig,
} from "./conflicts";
import type { PlanBlock, PlanOptions, Proposal, ReflowConfig, ReflowOp, ReplanPlan } from "./schemas/reflow";
import { AiProposalDraftSchema } from "./schemas/reflow";
import type { Task } from "./schemas/task";
import {
  MS_MINUTE,
  addDaysToKey,
  dayKeyOf,
  formatClock,
  formatDuration,
  msFromDayKey,
  parseIsoToMs,
  weekdayLabel,
} from "./time";

export {
  AiProposalDraftSchema,
  AiProposalOutputSchema,
  AiReplanOutputSchema,
  PlanBlockSchema,
  PlanOptionsSchema,
  ProposalSchema,
  ReflowConfigSchema,
  ReflowOpSchema,
  ReplanPlanSchema,
} from "./schemas/reflow";
export type {
  AddOp,
  AiProposalDraft,
  AiProposalOutput,
  AiReplanOutput,
  MoveOp,
  PlanBlock,
  PlanOptions,
  Proposal,
  ReflowConfig,
  ReflowOp,
  RemoveOp,
  ReplanPlan,
  ResizeOp,
} from "./schemas/reflow";

/**
 * 閲嶆帓鏂规鐨?*鏈湴鍚堟硶鎬ц鍐冲櫒** 鈥斺€?椤圭洰閲屽敮涓€鏈夋潈璇?杩欏鏂规鑳界敤"鐨勫湴鏂广€? *
 * 鏋舵瀯涓诲紶锛圓RCHITECTURE 搂0锛夛細妯″瀷鍙礋璐?鎻愯"锛屽垽涓庡瓨鍏ㄥ湪鏈湴銆? * 鎵€浠ヨ繖閲岀殑杈撳叆姘歌繙鏄?*涓嶅彲淇＄殑澶栭儴鏁版嵁**锛堟ā鍨嬭緭鍑虹瓑鍚屼簬鐢ㄦ埛绮樿创鐨勮剰鏂囨湰锛夛紝
 * 姣忎竴閬撻椄閮藉湪鎷︿竴绫诲叿浣撶殑骞昏锛? *
 *   1. 缁撴瀯闂革細zod 纭牎楠岋紝瀛楁褰㈢姸涓嶅鐩存帴涓嶈繘鍏ヨ鍐筹紱
 *   2. 鍔ㄤ綔闂革細閫愭潯 op 妫€鏌?鈥斺€?涓嶉噸鍙?/ 涓嶈秴鏃ュ閲?/ 涓嶆敼 locked /
 *      涓嶈繚鑳?deadline 鍓嶇疆 / 鏃堕暱 > 0 / 涓嶈秺浣滄伅绐楀彛锛? *   3. 鏁翠綋闂革細鍔ㄤ綔鍏ㄩ儴钀藉湴鍚庡啀鍋氫竴娆″叏灞€鏍￠獙锛堟尅浣?姣忔潯閮藉悎娉曘€佸悎璧锋潵瓒婄晫"锛夛紱
 *   4. 鏁堟灉闂革細鐢ㄦ湰鍦板啿绐佹娴嬪疄绠楀墠鍚庡啿绐佹暟锛?*鍙樺樊鐨勬柟妗堢洿鎺ヤ笉鍛堢幇**銆? *
 * 琚姩浣滈椄鎷掓帀鐨?op 浼氫涪寮冨苟閲嶈瘯涓€娆★紱閲嶈瘯鍚庝粛涓嶅悎娉曪紝鏁村鏂规浣滃簾 鈥斺€? * "瀹佸彲灏戠粰涓€濂楁柟妗堬紝涔熶笉缁欎竴濂椾細姣佹帀鐢ㄦ埛涓€澶╃殑鏂规"銆? */

export const DEFAULT_REFLOW_CONFIG: ReflowConfig = { dayStartMin: 7 * 60, dayEndMin: 23 * 60 };

/** 鐗虹壊椤瑰垽瀹氱嚎锛?2:00 涔嬪悗杩樺湪鍋氫簨銆?8:00 涔嬪墠灏卞紑宸?*/
const NIGHT_LINE_MIN = 22 * 60;
const EARLY_LINE_MIN = 8 * 60;

/** 鍗曚釜鍔ㄤ綔琚嫆鐨勫師鍥狅紙璋冭瘯鍙锛屼篃浼氬洖鐏岀粰 AI 灞傚仛瀹氬悜淇锛?*/
export interface OpRejection {
  opIndex: number;
  opType: ReflowOp["type"];
  taskId: string | null;
  reason: string;
}

/** 鏁村鏂规琚綔搴熺殑鍘熷洜 */
export interface ProposalRejection {
  proposalId: string;
  label: string;
  reasons: string[];
}

/** 鍏ㄥ眬鏍￠獙鐨勪竴鏉¤繚瑙勶細蹇呴』甯?taskIds锛屾墠鑳藉弽鏌ユ槸鍝釜鍔ㄤ綔闂殑绁?*/
interface Violation {
  /** 杩濊鐨勭绫伙細璋冪敤鏂规嵁姝ゅ喅瀹氭帾杈烇紙瑁佸喅鍣ㄧ粰浜虹湅锛屾棫鏍￠獙鍣ㄧ粰鏃ュ織/娴嬭瘯鐪嬶級 */
  kind: "overlap" | "capacity" | "locked" | "duration" | "deadline";
  reason: string;
  taskIds: string[];
}

/** 瑁佸喅閫氳繃鍚庣殑鏂规锛氬崱鐗?+ 钀藉湴鍚庣殑浠诲姟闆嗭紙鏁翠綋鏇挎崲鐢級 */
export interface AdjudicatedProposal {
  proposal: Proposal;
  tasksAfter: Task[];
  conflictsBefore: Conflict[];
  conflictsAfter: Conflict[];
  droppedOps: OpRejection[];
}

export type Adjudication =
  | { ok: true; value: AdjudicatedProposal }
  | { ok: false; rejection: ProposalRejection };

export interface JudgeReport {
  accepted: AdjudicatedProposal[];
  rejected: ProposalRejection[];
}

/** 瑁佸喅鎵€闇€鐨勫閮ㄨ緭鍏ャ€俙now` 蹇呴』娉ㄥ叆锛屼笌鍐茬獊妫€娴嬩繚鎸佸悓涓€濂楁椂闂村彛寰?*/
export interface JudgeInputs {
  now: Date;
  config?: ReflowConfig;
  detect?: DetectConfig;
}

interface Block {
  startMs: number;
  endMs: number;
}

function blockOf(startMs: number | null, endMs: number | null): Block | null {
  if (startMs === null || endMs === null) return null;
  if (endMs <= startMs) return null;
  return { startMs, endMs };
}

function blockOfTask(task: Task): Block | null {
  return blockOf(parseIsoToMs(task.start), parseIsoToMs(task.end));
}

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
// 鍔ㄤ綔闂革細鍗曟潯 op 鐨勭‖绾︽潫
// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/**
 * 浣滄伅绐楀彛妫€鏌ャ€? * 涓轰粈涔堟柟妗堜笉鍏佽璺ㄥぉ鍧楋細涓€涓?22:00鈥?1:00 鐨勫潡鍦ㄦ椂闂磋酱涓婁細妯法涓ゅ垪锛? * 宸紓楂樹寒鐨?骞界伒鍧?寮х嚎"鐢绘硶琛ㄨ揪涓嶄簡瀹冿紝鑰屼笖瀹冨嚑涔庡繀鐒舵槸妯″瀷绠楅敊鐨勪骇鐗┿€? * 鐪熸鐨勮法澶╀换鍔★紙鐢ㄦ埛鑷繁褰曠殑锛変笉缁忚繃杩欓噷锛屾柟妗堜笉璇ユ柊閫犺繖绉嶅潡銆? */
function windowViolation(block: Block, config: ReflowConfig): string | null {
  const dayKey = dayKeyOf(block.startMs);
  const windowStart = msFromDayKey(dayKey, config.dayStartMin);
  const windowEnd = msFromDayKey(dayKey, config.dayEndMin);
  if (block.startMs < windowStart || block.endMs > windowEnd) {
    return `瓒呭嚭浣滄伅绐楀彛 ${formatClock(windowStart)}鈥?{formatClock(windowEnd)}`;
  }
  return null;
}

/** deadline 鍓嶇疆锛氫换鍔′笉鑳芥帓鍒拌嚜宸辩殑鎴鏃堕棿涔嬪悗 */
function deadlineViolation(task: Task, endMs: number): string | null {
  const deadlineMs = parseIsoToMs(task.deadline);
  if (deadlineMs === null) return null;
  if (endMs <= deadlineMs) return null;
  return `鎺掑埌浜嗘埅姝㈡椂闂翠箣鍚巂;
}

interface ApplyResult {
  ok: boolean;
  /** ok 鏃剁殑浠诲姟闆嗭紙鏂版暟缁勶紝涓嶆敼鍏ュ弬锛?*/
  tasks: Task[];
  /** ok 鏃惰鏀瑰姩/鏂板鐨勪换鍔?id */
  taskId: string;
  /** 寮€濮嬫椂闂存槸鍚﹀彉浜嗭紙movedCount 鐢ㄥ畠锛?*/
  changedStart: boolean;
  /** 鍙樺姩鍓嶇殑寮€濮嬫椂闂达紙deviationMin 鐢ㄥ畠锛涙柊澧炰换鍔′负 null锛?*/
  baselineStartMs: number | null;
  /** 鍙樺姩鍚庣殑寮€濮嬫椂闂?*/
  newStartMs: number;
  reason: string;
}

const REJECT = (reason: string, tasks: readonly Task[]): ApplyResult => ({
  ok: false,
  tasks: [...tasks],
  taskId: "",
  changedStart: false,
  baselineStartMs: null,
  newStartMs: 0,
  reason,
});

/**
 * 搴旂敤鍗曟潯 op 骞跺氨鍦拌繃闂搞€? * 涓€鏃︿笉杩囬椄绔嬪嵆鍥炴粴锛堣繑鍥炲師浠诲姟闆嗭級锛屾墍浠?琚嫆鐨?op 涓嶄骇鐢熶换浣曞壇浣滅敤"銆? */
function applyOp(
  tasks: readonly Task[],
  op: ReflowOp,
  opIndex: number,
  config: ReflowConfig,
): ApplyResult {
  switch (op.type) {
    case "move":
    case "resize": {
      const target = tasks.find((task) => task.id === op.taskId);
      if (!target) return REJECT(`鏂规閲屽嚭鐜颁簡涓嶅瓨鍦ㄧ殑浠诲姟 id锛?{op.taskId}`, tasks);
      if (target.done) return REJECT(`銆?{target.title}銆嶅凡瀹屾垚锛屼笉闇€瑕侀噸鎺抈, tasks);
      // 鍥哄畾鍧楋紙璇捐〃/鎺掔彮锛夋槸澶栭儴涓栫晫缁欑殑绾︽潫锛屾柟妗堢Щ鍔ㄥ畠灏辨槸鑷娆轰汉
      if (target.locked) return REJECT(`銆?{target.title}銆嶆槸鍥哄畾鍧楋紝鏂规涓嶅緱绉诲姩`, tasks);

      const block = blockOf(parseIsoToMs(op.start), parseIsoToMs(op.end));
      if (!block) return REJECT(`銆?{target.title}銆嶇殑璧锋鏃堕棿涓嶅悎娉曪紙鏃堕暱蹇呴』 > 0锛塦, tasks);

      const minutes = Math.round((block.endMs - block.startMs) / MS_MINUTE);
      if (op.type === "move") {
        // move 鐨勮涔夊氨鏄笉鏀瑰彉鏃堕暱锛涙椂闀垮彉浜嗗簲璇ョ敤 resize锛岃繖閲屽垽姝绘槸涓轰簡
        // 璁?杩欏鏂规鍒板簳鍔ㄤ簡浠€涔?濮嬬粓鍙В閲?        if (Math.abs(minutes - target.durationMin) > 1) {
          return REJECT(
            `銆?{target.title}銆嶆椂闀夸粠 ${formatDuration(target.durationMin)} 鍙樻垚 ${formatDuration(minutes)}锛岀Щ鍔ㄤ笉寰楁敼鍙樻椂闀匡紙搴斾娇鐢?resize锛塦,
            tasks,
          );
        }
      } else if (!target.flexible) {
        // 鍙湁鏍囪涓哄彲椤哄欢/鍙帇缂╃殑浠诲姟鎵嶅厑璁哥缉姘达紱鍏朵綑浠诲姟鐨勬椂闂存槸纭壙璇?        return REJECT(`銆?{target.title}銆嶆湭鏍囪涓哄彲鍘嬬缉锛屾柟妗堜笉寰楁敼鍙樺畠鐨勬椂闀縛, tasks);
      }

      const windowIssue = windowViolation(block, config);
      if (windowIssue) return REJECT(`銆?{target.title}銆?{windowIssue}`, tasks);

      const deadlineIssue = deadlineViolation(target, block.endMs);
      if (deadlineIssue) return REJECT(`銆?{target.title}銆?{deadlineIssue}`, tasks);

      // 娉ㄦ剰锛氫笉閲嶅彔涓庢棩瀹归噺**涓嶅湪杩欓噷鍒?*銆?      // 瀹冧滑鏄?鍏ㄥ眬"鎬ц川锛欳 鏂规瑕佹妸涓や欢閲嶅彔鐨勪簨涓€璧锋尓寮€锛屼腑闂存€佸繀鐒惰繕鏄噸鍙犵殑锛?      // 閫愭潯鍒や細鎶婂悎娉曟柟妗堥敊鏉€銆傝繖涓ら亾闂告斁鍦ㄦ暣浣撴牎楠岄噷锛屽鍏ㄩ儴鍔ㄤ綔钀藉湴鍚庣殑鐘舵€佸垽銆?      const next = tasks.map((task) =>
        task.id === target.id
          ? {
              ...task,
              start: new Date(block.startMs).toISOString(),
              end: new Date(block.endMs).toISOString(),
              durationMin: minutes,
            }
          : task,
      );

      const baselineStartMs = parseIsoToMs(target.start);
      return {
        ok: true,
        tasks: next,
        taskId: target.id,
        changedStart: baselineStartMs !== block.startMs,
        baselineStartMs,
        newStartMs: block.startMs,
        reason: "",
      };
    }

    case "add": {
      const block = blockOf(parseIsoToMs(op.start), parseIsoToMs(op.end));
      if (!block) return REJECT("鏂板鏃堕棿鍧楃殑璧锋涓嶅悎娉曪紙鏃堕暱蹇呴』 > 0锛?, tasks);

      // id 鐢辨湰鍦扮‘瀹氭€х敓鎴愶細妯″瀷缁欑殑涓嶇畻鏁帮紝鍚﹀垯瀹冧細缂栧嚭涓庣幇鏈変换鍔℃挒杞︾殑 id
      const taskId = op.taskId ?? `added-${opIndex + 1}`;
      if (tasks.some((task) => task.id === taskId)) {
        return REJECT(`鏂板浠诲姟鐨?id 涓庣幇鏈変换鍔″啿绐侊細${taskId}`, tasks);
      }

      const windowIssue = windowViolation(block, config);
      if (windowIssue) return REJECT(`鏂板鏃堕棿鍧?{windowIssue}`, tasks);

      const deadlineMs = parseIsoToMs(op.deadline ?? null);
      if (deadlineMs !== null && block.endMs > deadlineMs) {
        return REJECT("鏂板鏃堕棿鍧楁帓鍒颁簡瀹冭嚜宸辩殑鎴鏃堕棿涔嬪悗", tasks);
      }

      const created: Task = {
        id: taskId,
        title: op.title,
        start: new Date(block.startMs).toISOString(),
        end: new Date(block.endMs).toISOString(),
        durationMin: Math.round((block.endMs - block.startMs) / MS_MINUTE),
        deadline: op.deadline ?? null,
        priority: op.priority ?? 2,
        source: "manual",
        done: false,
        rawTextOrigin: null,
        location: op.location ?? null,
        locked: false,
        // 琛ュ嚭鏉ョ殑鍑嗗鏃堕棿澶╃劧鏄彲璋冪殑锛氬畠瀛樺湪鐨勬剰涔夊氨鏄紦鍐?        flexible: true,
        parentId: null,
        repeat: null,
        needsReview: false,
      };

      const next = [...tasks, created];
      return {
        ok: true,
        tasks: next,
        taskId,
        // 鏂板涓嶆槸"鎸姩"锛屼笉璁″叆 movedCount锛堝崱鐗囦笂鐢ㄣ€岋紜 鏂板銆嶅崟鐙〃杈撅級
        changedStart: false,
        baselineStartMs: null,
        newStartMs: block.startMs,
        reason: "",
      };
    }

    case "remove": {
      const target = tasks.find((task) => task.id === op.taskId);
      if (!target) return REJECT(`鏂规閲屽嚭鐜颁簡涓嶅瓨鍦ㄧ殑浠诲姟 id锛?{op.taskId}`, tasks);
      if (target.locked) return REJECT(`銆?{target.title}銆嶆槸鍥哄畾鍧楋紝鏂规涓嶅緱鍒犻櫎`, tasks);
      if (target.done) return REJECT(`銆?{target.title}銆嶅凡瀹屾垚锛屽垹闄や細涓㈡帀宸插畬鎴愯褰昤, tasks);
      return {
        ok: true,
        tasks: tasks.filter((task) => task.id !== target.id),
        taskId: target.id,
        changedStart: false,
        // 鍒犻櫎涓嶄骇鐢?鍋忕鍘熻鍒?鐨勫垎閽熸暟锛屽彧褰卞搷鏉℃暟
        baselineStartMs: null,
        newStartMs: 0,
        reason: "",
      };
    }

    default: {
      const exhaustive: never = op;
      return REJECT(`鏈煡鐨勫姩浣滅被鍨嬶細${String(exhaustive)}`, tasks);
    }
  }
}

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
// 鏁翠綋闂革細鎵€鏈夊姩浣滆惤鍦板悗鐨勫叏灞€鏍￠獙
// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/**
 * 鏁翠綋鏍￠獙 鈥斺€?鎵€鏈夊姩浣滆惤鍦?*涔嬪悗**鎵嶅垽鐨勯偅鍑犻亾闂搞€? *
 * 涓轰粈涔?涓嶉噸鍙?鏃ュ閲?蹇呴』鏀惧埌杩欓噷鑰屼笉鏄€愭潯鍒わ細
 * 鏂规甯稿父瑕佹垚濂楀湴鍔ㄣ€俿eed 閲岀殑 C 鏂规鎶?19:00 鎾炲湪涓€璧风殑涓や欢浜嬫媶鎴?18:30 涓?21:00锛? * 绗竴姝ユ尓瀹岀殑**涓棿鎬佷粛鐒舵槸閲嶅彔鐨?*鈥斺€旈€愭潯鍒や細鎶婃纭柟妗堢洿鎺ラ敊鏉€銆? * 鎵€浠ラ€愭潯闂稿彧绠?杩欐潯鍔ㄤ綔鑷繁"鐨勭‖绾︽潫锛堝瓨鍦ㄦ€?鍥哄畾鍧?鏃堕暱/绐楀彛/鎴锛夛紝
 * 渚濊禆鍒汉鐨勬€ц川涓€寰嬬瓑鍏ㄩ儴钀藉湴鍚庝竴娆℃€у垽銆? *
 * 鍚屾椂杩欓噷鍙垽**鏂规鑷繁閫犳垚鐨?*杩濊锛? * 鐜扮姸鏈潵灏辨湁鐨勯噸鍙犮€佹湰鏉ュ氨瓒呯殑瀹归噺锛屼笉绠楀埌鏂规澶翠笂锛堝惁鍒欏熀绾夸竴瓒呮爣锛? * 鎵€鏈夋柟妗堥兘浼氳鍒ゆ锛岀敤鎴锋案杩滄嬁涓嶅埌寤鸿锛夈€? */
function validateWhole(
  after: readonly Task[],
  baseline: readonly Task[],
  touchedIds: ReadonlySet<string>,
  detect: DetectConfig,
): Violation[] {
  const violations: Violation[] = [];

  // 1) 鍥哄畾鍧楁湭琚Щ鍔?鍒犻櫎锛氫俊浠绘寚鏍?lockedTouched 蹇呴』涓?0
  for (const before of baseline) {
    if (!before.locked) continue;
    const current = after.find((task) => task.id === before.id);
    if (!current) {
      violations.push({
        kind: "locked",
        reason: `鍥哄畾鍧椼€?{before.title}銆嶈鏂规鍒犻櫎`,
        taskIds: [before.id],
      });
      continue;
    }
    if (current.start !== before.start || current.end !== before.end) {
      violations.push({
        kind: "locked",
        reason: `鍥哄畾鍧椼€?{before.title}銆嶈鏂规绉诲姩`,
        taskIds: [before.id],
      });
    }
  }

  // 2) 涓や袱涓嶉噸鍙狅紙鍗婂紑鍖洪棿锛夛細鍙拷绌?鏂规鍔ㄨ繃鐨勪换鍔?鍙備笌鍒扮殑鏂伴噸鍙?  const timed = timedTasksOf(after).sort((a, b) => a.startMs - b.startMs);
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const a = timed[i];
      const b = timed[j];
      if (!a || !b) continue;
      if (a.endMs <= b.startMs) break; // 宸叉寜寮€濮嬫椂闂存帓搴忥紝鍚庨潰鐨勪笉鍙兘涓?a 閲嶅彔
      const touched = touchedIds.has(a.task.id) || touchedIds.has(b.task.id);
      if (!touched) continue; // 鐜扮姸灏辨湁鐨勯噸鍙犱笉褰掓柟妗堣礋璐?      violations.push({
        kind: "overlap",
        reason: `钀藉湴鍚庛€?{a.task.title}銆嶄笌銆?{b.task.title}銆嶄粛鐒堕噸鍙燻,
        taskIds: [a.task.id, b.task.id],
      });
    }
  }

  // 3) 姣忔棩瀹归噺锛氬彧鏈夋柟妗堟妸鏌愬ぉ**鍙樺緱鏇存弧**涓旇秺杩囦笂闄愶紝鎵嶇畻瀹冪殑闂
  const baselineTotals = dailyTotals(timedTasksOf(baseline));
  const totals = dailyTotals(timedTasksOf(after));
  for (const [dayKey, used] of totals) {
    if (used <= detect.dayCapacityMin) continue;
    const before = baselineTotals.get(dayKey) ?? 0;
    if (used <= before) continue; // 娌℃湁鏇寸碂
    const ids = after
      .filter((task) => {
        const block = blockOfTask(task);
        return block !== null && dayKeyOf(block.startMs) === dayKey && touchedIds.has(task.id);
      })
      .map((task) => task.id);
    violations.push({
      kind: "capacity",
      reason: `${dayKey} 绱 ${formatDuration(used)}锛岃秴杩囨瘡鏃ヤ笂闄?${formatDuration(detect.dayCapacityMin)}`,
      taskIds: ids,
    });
  }

  // 4) 鏃堕暱 > 0 涓?deadline 鍓嶇疆锛氬彧鏌ユ柟妗堝姩杩囩殑浠诲姟
  for (const task of after) {
    if (!touchedIds.has(task.id)) continue;
    const startMs = parseIsoToMs(task.start);
    const endMs = parseIsoToMs(task.end);
    if (startMs === null || endMs === null) continue;
    if (endMs <= startMs) {
      violations.push({ kind: "duration", reason: `銆?{task.title}銆嶇殑鏃堕暱涓?0 鎴栬礋`, taskIds: [task.id] });
      continue;
    }
    const deadlineMs = parseIsoToMs(task.deadline);
    if (deadlineMs !== null && endMs > deadlineMs) {
      violations.push({
        kind: "deadline",
        reason: `銆?{task.title}銆嶈鎺掑埌鎴鏃堕棿涔嬪悗`,
        taskIds: [task.id],
      });
    }
  }

  return violations;
}

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
// 缁熻涓庣壓鐗查」
// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

interface AppliedOp {
  opIndex: number;
  op: ReflowOp;
  taskId: string;
  changedStart: boolean;
  baselineStartMs: number | null;
  newStartMs: number;
}

interface GateResult {
  tasks: Task[];
  applied: AppliedOp[];
  dropped: OpRejection[];
}

/** 閫愭潯杩囬椄锛氳鎷掔殑 op 涓㈠純骞剁户缁紝涓嶄骇鐢熶换浣曞壇浣滅敤 */
function gateOps(
  baseline: readonly Task[],
  ops: readonly { op: ReflowOp; opIndex: number }[],
  config: ReflowConfig,
): GateResult {
  let current: Task[] = [...baseline];
  const applied: AppliedOp[] = [];
  const dropped: OpRejection[] = [];

  for (const { op, opIndex } of ops) {
    const result = applyOp(current, op, opIndex, config);
    if (!result.ok) {
      dropped.push({
        opIndex,
        opType: op.type,
        taskId: op.type === "add" ? null : op.taskId,
        reason: result.reason,
      });
      continue;
    }
    current = result.tasks;
    applied.push({
      opIndex,
      op,
      taskId: result.taskId,
      changedStart: result.changedStart,
      baselineStartMs: result.baselineStartMs,
      newStartMs: result.newStartMs,
    });
  }

  return { tasks: current, applied, dropped };
}

/** 缁撴潫鏃堕棿鏅氫簬鏌愭潯绾跨殑鏃ユ湡闆嗗悎锛?22:00 鍚庝粛鍦ㄥ仛浜?锛?*/
function daysEndingAfter(tasks: readonly Task[], lineMin: number): Set<string> {
  const days = new Set<string>();
  for (const { startMs, endMs } of timedTasksOf(tasks)) {
    const dayKey = dayKeyOf(startMs);
    const endMin = Math.round((endMs - msFromDayKey(dayKey, 0)) / MS_MINUTE);
    if (endMin > lineMin) days.add(dayKey);
  }
  return days;
}

/** 寮€濮嬫椂闂存棭浜庢煇鏉＄嚎鐨勬棩鏈熼泦鍚堬紙"08:00 鍓嶅氨寮€宸?锛?*/
function daysStartingBefore(tasks: readonly Task[], lineMin: number): Set<string> {
  const days = new Set<string>();
  for (const { startMs } of timedTasksOf(tasks)) {
    const dayKey = dayKeyOf(startMs);
    const startMin = Math.round((startMs - msFromDayKey(dayKey, 0)) / MS_MINUTE);
    if (startMin < lineMin) days.add(dayKey);
  }
  return days;
}

/**
 * 鐗虹壊椤癸細杩欏鏂规鎹㈡潵"鍐茬獊鍙樺皯"锛屼唬浠锋槸浠€涔堛€? * 鍙姤鍛?*鏂板**鐨勪唬浠凤紙鍘熻鍒掑氨鏈夌殑涓嶇畻鐗虹壊锛夛紝骞朵笖寮哄埗涓嶈秴杩?6 鏉?鈥斺€? * 鍗＄墖涓婂彧鏀惧緱涓嬩竴琛岋紝鍐欏浜嗙敤鎴风洿鎺ヤ笉鐪嬩簡銆? */
function computeSacrifices(baseline: readonly Task[], after: readonly Task[], conflictsAfter: number): string[] {
  const items: string[] = [];
  if (conflictsAfter > 0) items.push(`浠嶆湁 ${conflictsAfter} 涓啿绐乣);

  const lateAfter = daysEndingAfter(after, NIGHT_LINE_MIN);
  const lateBefore = daysEndingAfter(baseline, NIGHT_LINE_MIN);
  for (const dayKey of [...lateAfter].sort()) {
    if (!lateBefore.has(dayKey)) items.push(`${weekdayLabel(dayKey)} 22:00 鍚庝粛鏈変换鍔);
  }

  const earlyAfter = daysStartingBefore(after, EARLY_LINE_MIN);
  const earlyBefore = daysStartingBefore(baseline, EARLY_LINE_MIN);
  for (const dayKey of [...earlyAfter].sort()) {
    if (!earlyBefore.has(dayKey)) items.push(`${weekdayLabel(dayKey)} 鏃╁叓琚崰鐢╜);
  }

  return items.slice(0, 6);
}

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
// 涓绘祦绋?// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export interface ProposalCandidate {
  id: string;
  rank: 1 | 2 | 3;
  label: string;
  ops: ReflowOp[];
}

/**
 * 瑁佸喅涓€濂楁柟妗堛€傝繑鍥?ok:false 鐨勬柟妗?*涓嶅緱鍛堢幇缁欑敤鎴?*銆? *
 * 涓夋鏈轰細锛堝搴?SPEC B1 鐨?涓㈠純骞堕噸璇曚竴娆?锛夛細
 *   1. 閫愭潯杩囬椄 鈫?涓㈡帀涓嶅悎娉曠殑鍔ㄤ綔锛? *   2. 鏁翠綋鏍￠獙 鈫?浠嶄笉鍚堟硶鏃讹紝鎶婅繚瑙勪换鍔″搴旂殑鍔ㄤ綔涔熶涪鎺夛紝鍐嶉噸璇曚竴娆★紱
 *   3. 鏁堟灉闂?鈫?鍐茬獊鏁版病鏈変笅闄嶏紙鎴栦笂鍗囷級鐨勬柟妗堜綔搴熴€? */
export function adjudicateProposal(
  candidate: ProposalCandidate,
  tasks: readonly Task[],
  inputs: JudgeInputs,
): Adjudication {
  if (!Number.isFinite(inputs.now.getTime())) {
    throw new TypeError("adjudicateProposal 闇€瑕佷竴涓湁鏁堢殑 now锛堢姝㈤殣寮忎娇鐢ㄥ綋鍓嶆椂闂达級");
  }
  const config = inputs.config ?? DEFAULT_REFLOW_CONFIG;
  const detect = inputs.detect ?? DEFAULT_DETECT_CONFIG;
  const baseline = [...tasks];

  const conflictsBefore = detectConflicts(baseline, detect, inputs.now);
  const indexed = candidate.ops.map((op, opIndex) => ({ op, opIndex }));

  const gate1 = gateOps(baseline, indexed, config);
  if (gate1.applied.length === 0) {
    return {
      ok: false,
      rejection: {
        proposalId: candidate.id,
        label: candidate.label,
        reasons: ["鏂规閲屾病鏈変换浣曚竴鏉″姩浣滈€氳繃鏈湴鏍￠獙", ...gate1.dropped.map((d) => d.reason)],
      },
    };
  }

  const touched1 = new Set(gate1.applied.map((applied) => applied.taskId));
  const violations1 = validateWhole(gate1.tasks, baseline, touched1, detect);
  let finalGate = gate1;
  const dropped = [...gate1.dropped];

  if (violations1.length > 0) {
    // 閲嶈瘯涓€娆★細鎶婅繚瑙勪换鍔＄壍杩炵殑鍔ㄤ綔涔熶涪鎺夛紝閲嶆柊杩囬椄
    const offending = new Set(violations1.flatMap((violation) => violation.taskIds));
    const survivors = gate1.applied.filter((applied) => !offending.has(applied.taskId));
    const retry = gateOps(
      baseline,
      survivors.map((applied) => ({ op: applied.op, opIndex: applied.opIndex })),
      config,
    );
    for (const applied of gate1.applied) {
      if (offending.has(applied.taskId)) {
        // 鎶?涓轰粈涔堣涓?鍐欐垚鍏蜂綋鍘熷洜鑰屼笉鏄竴鍙?鏍￠獙涓嶉€氳繃"锛?        // 杩欏彞璇濅細琚洖鐏岀粰 AI 灞傚仛瀹氬悜淇锛屽惈绯婄殑鍘熷洜绛変簬娌＄粰銆?        const reason = violations1
          .filter((violation) => violation.taskIds.includes(applied.taskId))
          .map((violation) => violation.reason)
          .join("锛?);
        dropped.push({
          opIndex: applied.opIndex,
          opType: applied.op.type,
          taskId: applied.taskId,
          reason: reason.length > 0 ? reason : "璇ュ姩浣滃鑷存暣浣撴牎楠屼笉閫氳繃锛岄噸璇曟椂琚涪寮?,
        });
      }
    }
    const touched2 = new Set(retry.applied.map((applied) => applied.taskId));
    const violations2 = validateWhole(retry.tasks, baseline, touched2, detect);
    if (retry.applied.length === 0 || violations2.length > 0) {
      return {
        ok: false,
        rejection: {
          proposalId: candidate.id,
          label: candidate.label,
          reasons: [...violations1, ...violations2].map((violation) => violation.reason),
        },
      };
    }
    finalGate = retry;
  }

  const conflictsAfter = detectConflicts(finalGate.tasks, detect, inputs.now);

  // 鏁堟灉闂革細鍐茬獊鏁版病鏈変笅闄嶇殑鏂规涓嶄笂妗岋紙SPEC B3锛氫笂鍗囨柟妗堢洿鎺ヤ笉灞曠ず锛?  if (conflictsAfter.length >= conflictsBefore.length) {
    return {
      ok: false,
      rejection: {
        proposalId: candidate.id,
        label: candidate.label,
        reasons: [
          `鍐茬獊 ${conflictsBefore.length} 鈫?${conflictsAfter.length}锛屾病鏈夊彉濂絗,
        ],
      },
    };
  }

  // 淇′换鎸囨爣锛氬浐瀹氬潡琚姩杩囧氨鏄笉鍙帴鍙楃殑鏂规锛堢粨鏋勪笂宸茬粡鎸′綇锛岃繖閲屾槸鏈€鍚庝竴閬撹嚜妫€锛?  const baselineById = new Map(baseline.map((task) => [task.id, task]));
  const lockedTouched = finalGate.applied.filter(
    (applied) => baselineById.get(applied.taskId)?.locked === true,
  ).length;
  if (lockedTouched > 0) {
    return {
      ok: false,
      rejection: {
        proposalId: candidate.id,
        label: candidate.label,
        reasons: [`瑙﹀強浜?${lockedTouched} 涓浐瀹氬潡锛屾柟妗堜綔搴焋],
      },
    };
  }

  const movedCount = finalGate.applied.filter((applied) => applied.changedStart).length;
  const deviationMin = finalGate.applied.reduce((sum, applied) => {
    if (applied.baselineStartMs === null) return sum; // 鏂板浠诲姟娌℃湁"鍘熻鍒?鍙亸绂?    return sum + Math.abs(Math.round((applied.newStartMs - applied.baselineStartMs) / MS_MINUTE));
  }, 0);

  const proposal: Proposal = {
    id: candidate.id,
    rank: candidate.rank,
    label: candidate.label,
    ops: finalGate.applied.map((applied) => applied.op),
    conflictsBefore: conflictsBefore.length,
    conflictsAfter: conflictsAfter.length,
    movedCount,
    deviationMin,
    lockedTouched,
    sacrifices: computeSacrifices(baseline, finalGate.tasks, conflictsAfter.length),
    rejected: dropped.length > 0 ? dropped.map((entry) => ({ reason: entry.reason })) : undefined,
  };

  return {
    ok: true,
    value: {
      proposal,
      tasksAfter: finalGate.tasks,
      conflictsBefore,
      conflictsAfter,
      droppedOps: dropped,
    },
  };
}

/**
 * 鎵归噺瑁佸喅妯″瀷杩斿洖鐨勬柟妗?鈥斺€?AI 灞傚敮涓€璇ヨ皟鐢ㄧ殑鍏ュ彛銆? *
 * 杈撳叆鐢?`unknown` 鏄湁鎰忕殑锛氭ā鍨嬭繑鍥炲€煎湪绫诲瀷绯荤粺鐪奸噷浠€涔堥兘涓嶄繚璇侊紝
 * 鍏堣繃 zod锛堢涓€閬撻椄锛夛紝鍐嶉€愪釜瑁佸喅銆傚绾︿笉杩囩殑鏂规杩?rejected 鑰屼笉鏄姏寮傚父锛? * 杩欐牱涓婂眰鑳藉仛"鍙淇鍏ュ彛"鑰屼笉鏄櫧灞忋€? */
export function judgeProposals(
  rawProposals: readonly unknown[],
  tasks: readonly Task[],
  inputs: JudgeInputs,
): JudgeReport {
  const accepted: AdjudicatedProposal[] = [];
  const rejected: ProposalRejection[] = [];

  rawProposals.forEach((raw, index) => {
    // 濂戠害鏈€澶?3 濂楋紱澶氱粰鐨勬寜绗?3 鍚嶅鐞嗭紝缁濅笉鍥犱负绗?4 濂楄€屽穿鎺夋暣鎵?    const rank = (Math.min(index + 1, 3) as 1 | 2 | 3);
    const proposalId = `proposal#${index + 1}`;
    const parsed = AiProposalDraftSchema.safeParse(raw);
    if (!parsed.success) {
      rejected.push({
        proposalId,
        label: "锛堢粨鏋勪笉鍚堟硶鐨勬柟妗堬級",
        reasons: parsed.error.issues.map((issue) => `瀛楁 ${issue.path.join(".")}锛?{issue.message}`),
      });
      return;
    }
    const result = adjudicateProposal(
      { id: proposalId, rank, label: parsed.data.label, ops: parsed.data.ops },
      tasks,
      inputs,
    );
    if (result.ok) accepted.push(result.value);
    else rejected.push(result.rejection);
  });

  accepted.sort((a, b) => a.proposal.rank - b.proposal.rank);
  return { accepted, rejected };
}

/** 钀藉湴锛氳繑鍥炴暣浣撴浛鎹㈢敤鐨勬柊浠诲姟闆嗭紙涓嶅仛鍙嶅悜 op锛屽洖婊氶潬蹇収锛?*/
export function applyProposal(adjudicated: AdjudicatedProposal): Task[] {
  return adjudicated.tasksAfter;
}

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
// 鏈湴鍏滃簳鎻愯锛堟棤妯″瀷 / 妯″瀷鏂规鍏ㄨ鎷掓椂鐢級
// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

interface Slot {
  start: string;
  end: string;
}

/**
 * 鍦ㄦ煇涓€澶╅噷鎵句竴娈佃兘鏀句笅 `durationMin` 鐨勭┖妗ｃ€? *
 * 涓轰粈涔堟寜"宸插崰鐢ㄥ尯闂磋烦鏍?鑰屼笉鏄€愬垎閽熸壂锛氫竴澶?960 鍒嗛挓锛岄€愬垎閽熸壂鏃㈡參鍙堥毦璇伙紱
 * 鎺掑簭鍚庡彧鍦ㄤ笌宸插崰鐢ㄥ潡纰版挒鏃舵墠绉诲姩娓告爣锛岄€昏緫涓€鐪艰兘鐪嬫噦锛屼篃涓嶄緷璧栦换浣曢殢鏈烘暟銆? * 闂撮殧瑕佹眰鎸?*瀹屾暣** `gapMin.default` 鐣欙紝涓嶅悆 tolerance 鈥斺€?鐢熸垚鐣欏緱姣斿垽瀹氫弗锛? * 鎵嶄笉浼氳鑷繁鐨勫宸弽鍜紙瑙?`DEFAULT_PLAN_OPTIONS` 闄勮繎鐨勫悓涓€鏉℃敞閲婏級銆? */
function findSlotOnDay(
  others: readonly Task[],
  dayKey: string,
  durationMin: number,
  config: ReflowConfig,
  detect: DetectConfig,
): Slot | null {
  const dayStartMs = msFromDayKey(dayKey, config.dayStartMin);
  const dayEndMs = msFromDayKey(dayKey, config.dayEndMin);
  const durationMs = durationMin * MS_MINUTE;
  const gapMs = detect.gapMin.default * MS_MINUTE;

  // 褰撴棩宸插崰鐢ㄥ尯闂达紙鎸夊紑濮嬫椂闂存帓搴忥級锛涜法澶╂鍙畻涓庝粖澶╃浉浜ょ殑閭ｉ儴鍒?  const busy: Array<{ startMs: number; endMs: number }> = [];
  for (const { startMs, endMs } of timedTasksOf(others)) {
    const start = Math.max(startMs, dayStartMs);
    const end = Math.min(endMs, dayEndMs);
    if (end > start) busy.push({ startMs: start, endMs: end });
  }
  busy.sort((a, b) => a.startMs - b.startMs);

  // 褰撴棩鍓╀綑瀹归噺锛氬凡缁忔帓婊＄殑鏃ュ瓙涓嶅啀寰€閲屽
  const usedMin = dailyTotals(timedTasksOf(others)).get(dayKey) ?? 0;
  if (usedMin + durationMin > detect.dayCapacityMin) return null;

  let cursor = dayStartMs;
  for (const interval of busy) {
    if (cursor + durationMs <= interval.startMs) return slotAt(cursor, durationMs);
    cursor = Math.max(cursor, interval.endMs + gapMs);
    if (cursor + durationMs > dayEndMs) return null;
  }
  return cursor + durationMs <= dayEndMs ? slotAt(cursor, durationMs) : null;
}

function slotAt(startMs: number, durationMs: number): Slot {
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + durationMs).toISOString(),
  };
}

/**
 * 鏈湴鍏滃簳鎻愯 鈥斺€?**涓嶇粡杩囨ā鍨嬶紝浣嗕粛璧板悓涓€涓鍐冲櫒**銆? *
 * 涓轰粈涔堥渶瑕佸畠锛歚buildLocalPlans` 鐨勫亣璁炬槸"鎶婃墍鏈夊€欓€夊杩涗竴澶?锛岄亣鍒? * `demo-seed.json` 閭ｇ 15 鏉?/ 1780 鍒嗛挓鐨勬暟鎹細鍏ㄩ儴琚棩涓婇檺鎷掓帀锛堝疄娴?0 濂楋級銆? * 婕旂ず鏃?鐢熸垚閲嶆帓鏂规"灏变細鍙樻垚绌虹殑 鈥斺€?閭ｆ槸鏈€闅剧湅鐨勫け璐ユ€併€? *
 * 鍋氭硶锛氭嬁褰撳墠鍐茬獊閲?鍙尓鐨?浠诲姟锛屾寜涓夌绛栫暐鍚勬壘涓€涓┖妗ｏ紝鐢熸垚鏈€灏忓姩浣滈泦
 * 锛堜竴娆″彧鎸竴鏉★級锛岀劧鍚?*浜ょ粰 `adjudicateProposal` 瑁佸喅**銆傚洜姝よ繖閲屾案杩滀笉浼? * 浜у嚭闈炴硶鏂规锛氭晥鏋滈椄鐓ф棫鐢熸晥锛堝啿绐佹暟娌′笅闄嶇殑鐩存帴涓嶅嚭鐜板湪缁撴灉閲岋級銆? *
 * 涓夌绛栫暐鐨勫樊鍒彧鍦?寰€鍝壘绌烘。"锛? * - 鏈€灏忔敼鍔細褰撳ぉ閲岀殑绌烘。浼樺厛锛? * - 淇濈簿鍔涳細鏄庡ぉ涓婂崍锛? * - 淇濇埅姝㈡棩锛氬悗澶╄捣锛屽厛鎶婃挒鍦ㄤ竴璧风殑閭ｄ欢浜嬩粠蹇欑鏃ユ尓鍑哄幓銆? */
export function buildLocalProposals(
  tasks: readonly Task[],
  inputs: JudgeInputs,
): AdjudicatedProposal[] {
  if (!Number.isFinite(inputs.now.getTime())) {
    throw new TypeError("buildLocalProposals 闇€瑕佷竴涓湁鏁堢殑 now锛堢姝㈤殣寮忎娇鐢ㄥ綋鍓嶆椂闂达級");
  }
  const config = inputs.config ?? DEFAULT_REFLOW_CONFIG;
  const detect = inputs.detect ?? DEFAULT_DETECT_CONFIG;
  const baseline = [...tasks];

  const conflicts = detectConflicts(baseline, detect, inputs.now);
  if (conflicts.length === 0) return []; // 娌″啿绐佸氨涓嶇敤鎻愯锛屽埆纭€犳柟妗?
  // 鍊欓€夛細鍐茬獊閲屽嚭鐜拌繃銆佹湭瀹屾垚銆侀潪鍥哄畾鍧椼€佺湡鐨勫崰鏃舵鐨勪换鍔?  const movableIds: string[] = [];
  for (const conflict of conflicts) {
    for (const id of conflict.involvedTaskIds) {
      if (movableIds.includes(id)) continue;
      const task = baseline.find((candidate) => candidate.id === id);
      if (!task || task.done || task.locked || task.durationMin <= 0) continue;
      if (blockOfTask(task) === null) continue;
      movableIds.push(id);
    }
  }
  if (movableIds.length === 0) return [];

  const todayKey = dayKeyOf(inputs.now.getTime());
  const strategies: Array<{ label: string; offsetDays: number }> = [
    { label: "鏈€灏忔敼鍔?, offsetDays: 0 },
    { label: "淇濈簿鍔?, offsetDays: 1 },
    { label: "淇濇埅姝㈡棩", offsetDays: 2 },
  ];

  const accepted: AdjudicatedProposal[] = [];
  for (const [index, strategy] of strategies.entries()) {
    for (const taskId of movableIds) {
      const task = baseline.find((candidate) => candidate.id === taskId);
      if (!task) continue;
      const others = baseline.filter((candidate) => candidate.id !== taskId);

      // 浠庣瓥鐣ユ寚瀹氱殑閭ｅぉ璧凤紝鏈€澶氬線鍚庢壘涓€鍛?      let slot: Slot | null = null;
      for (let extra = 0; extra < 7 && slot === null; extra += 1) {
        const dayKey = addDaysToKey(todayKey, strategy.offsetDays + extra);
        slot = findSlotOnDay(others, dayKey, task.durationMin, config, detect);
      }
      if (!slot) continue;

      const result = adjudicateProposal(
        {
          id: `local-${index + 1}`,
          rank: (Math.min(index + 1, 3) as 1 | 2 | 3),
          label: strategy.label,
          ops: [{ type: "move", taskId, start: slot.start, end: slot.end }],
        },
        baseline,
        inputs,
      );
      if (result.ok) {
        accepted.push(result.value);
        break; // 涓€绉嶇瓥鐣ュ彧鍑轰竴濂楋紝閬垮厤涓夊闀垮緱涓€妯′竴鏍?      }
    }
  }
  return accepted;
}

/** 鏂规鍗＄墖鎽樿鐨勪竴琛屽瓧锛圫PEC B3 鐨?4 涓暟瀛?+ 鐗虹壊椤圭敱 UI 鎺掔増锛?*/
export function summarizeProposal(proposal: Proposal): string {
  // 鍋忕鐢?鍒嗛挓"鑰屼笉鏄?1 灏忔椂"锛氬亸绂婚噺鏄琚í鍚戞瘮杈冪殑鏁板瓧锛屽崟浣嶇粺涓€鎵嶅ソ鎵
  return `鎸姩 ${proposal.movedCount} 鏉?路 鍐茬獊 ${proposal.conflictsBefore}鈫?{proposal.conflictsAfter} 路 鍋忕 ${proposal.deviationMin} 鍒嗛挓 路 鍥哄畾璇捐鎸?${proposal.lockedTouched} 鏉;
}

/* 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
 * 鏈湴鍏滃簳鏂规鐢熸垚鍣紙鍘?`src/domain/planner.ts`锛屾寜 搂2 鐩綍鍙ｅ緞骞跺叆锛? *
 * 涓轰粈涔堝苟杩?reflow锛欰RCHITECTURE 搂2 鐨勭洰褰曟爲閲?domain 鍙湁
 * conflicts / reflow / snapshot 涓変釜绠楁硶鏂囦欢锛屾病鏈?planner銆傚畠浠湰鏉ュ氨鏄? * "閲嶆帓"鐨勪袱鍗?鈥斺€?鏈夋ā鍨嬫椂鏄鍐筹紝娌℃ā鍨嬫椂鏄‘瀹氭€у厹搴曠敓鎴愶紱
 * 鍒嗘垚涓や釜鏂囦欢鍚嶏紝璇勫鎸夋枃妗ｆ壘浠ｇ爜灏变細鎵句笉鍒般€? *
 * `validatePlan` 淇濈暀涓哄吋瀹瑰鍑猴紙AI 鍏滃簳灞備粛鍦ㄧ敤锛夛紝浣?*鏂颁唬鐮佽鐢? * `adjudicateProposal`**锛氶偅涓€濂楀浜?locked 淇濇姢銆乨eadline 鍓嶇疆銆? * "鍐茬獊鏁版病鍙樺ソ涓嶈涓婃"涓夐亾瀹冩病鏈夌殑闂搞€? * 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */

/**
 * 鏃у弬鏁板舰鐘讹細bufferMin / dailyLimitMin / 浣滄伅绐楀彛銆? * 涓や釜鏁板瓧鐩存帴鎶曞奖 SPEC 鐨勯粯璁ゅ€硷紝浣滄伅绐楀彛涓?`DEFAULT_REFLOW_CONFIG` 鍚屾簮锛? * 淇濊瘉"鐢熸垚鍣?鍜?瑁佸喅鍣?瀵逛竴澶╃殑鐞嗚В涓€鑷达紝涓嶄細涓€涓?7:00鈥?3:00銆佷竴涓?6:00鈥?4:00銆? */
export const DEFAULT_PLAN_OPTIONS: PlanOptions = {
  ...DEFAULT_CONFLICT_OPTIONS,
  dayStartMin: DEFAULT_REFLOW_CONFIG.dayStartMin,
  dayEndMin: DEFAULT_REFLOW_CONFIG.dayEndMin,
};

export interface PlanValidationResult {
  ok: boolean;
  issues: string[];
}

/**
 * 鏃ф柟妗堟牎楠屽櫒 鈥斺€?**鐜板湪鍙槸瑁佸喅鍣ㄧ殑涓€灞傞€傞厤锛屼笉鍐嶆槸绗簩濂楀垽瀹?*銆? *
 * 涓轰粈涔堝繀椤绘敹鍙ｏ紙涓籅ot 瑁佸喅 4锛夛細濡傛灉杩欓噷鍐嶇嫭绔嬪疄鐜颁竴閬?涓嶉噸鍙?鏃ュ閲?浣滄伅绐楀彛"锛? * 鍚屼竴濂?AI 鎻愯浼氬湪涓ゅ寰楀埌涓嶅悓缁撹锛岃瘎濮斾竴鐪煎氨鑳界湅鍑烘灦鏋勬紡娲炪€? * 鎵€浠ワ細
 * - 鍗曞潡绾︽潫锛堝瓨鍦ㄦ€?/ 鏃堕暱 / 绐楀彛 / 鎴锛夊鐢?`windowViolation`銆乣deadlineViolation`锛? * - 鍏ㄥ眬绾︽潫锛堜笉閲嶅彔 / 鏃ュ閲?/ 鍥哄畾鍧楋級澶嶇敤 `validateWhole`锛屼笌 `adjudicateProposal` 鍚屼竴浠戒唬鐮併€? *
 * 淇濈暀瀹冨彧涓哄吋瀹?`src/ai/demo.ts` 涓?`tests/ai/demo.test.ts`锛涙柊浠ｇ爜璇风敤
 * `adjudicateProposal`锛堝畠杩樺浜?鍐茬獊鏁版病鍙樺ソ涓嶈涓婃"杩欎竴閬擄級銆? *
 * @deprecated 鐢?`adjudicateProposal` 鍙栦唬锛涜皟鐢ㄦ柟鍒囧畬鍚庢湰鍑芥暟涓?`PlanValidationResult` 涓€骞跺垹闄ゃ€? */
export function validatePlan(
  plan: ReplanPlan,
  tasks: readonly Task[],
  dayKey: string,
  options: PlanOptions = DEFAULT_PLAN_OPTIONS,
): PlanValidationResult {
  const issues: string[] = [];
  if (plan.blocks.length === 0) issues.push("鏂规娌℃湁浠讳綍鏃堕棿鍧?);

  const config: ReflowConfig = { dayStartMin: options.dayStartMin, dayEndMin: options.dayEndMin };
  const detect: DetectConfig = { ...DEFAULT_DETECT_CONFIG, dayCapacityMin: options.dailyLimitMin };
  const titleOf = (id: string): string => tasks.find((task) => task.id === id)?.title ?? id;

  const seen = new Set<string>();
  for (const block of plan.blocks) {
    if (seen.has(block.taskId)) {
      issues.push(`鍚屼竴浠诲姟鍦ㄦ柟妗堥噷鍑虹幇浜嗕袱娆★細${block.taskId}`);
    }
    seen.add(block.taskId);

    const task = tasks.find((candidate) => candidate.id === block.taskId);
    if (!task) {
      issues.push(`鏂规閲屽嚭鐜颁簡涓嶅瓨鍦ㄧ殑浠诲姟 id锛?{block.taskId}`);
      continue;
    }
    const shape = blockOf(parseIsoToMs(block.start), parseIsoToMs(block.end));
    if (!shape) {
      issues.push(`銆?{task.title}銆嶇殑璧锋鏃堕棿涓嶅悎娉曪紙鏃堕暱蹇呴』 > 0锛塦);
      continue;
    }

    // 鏂规鏄?鏌愪竴澶╃殑閲嶆帓"锛氬潡钀藉埌鍒殑鏃ュ瓙璇存槑妯″瀷绠楅敊浣嶄簡
    const blockDay = dayKeyOf(shape.startMs);
    if (blockDay !== dayKey) {
      issues.push(`銆?{task.title}銆嶈鎺掑埌浜?${blockDay}锛屼笉鍦?${dayKey}`);
    }

    const minutes = Math.round((shape.endMs - shape.startMs) / MS_MINUTE);
    // 鏃у彛寰?涓嶈缂╂按"锛涙柊瑁佸喅鍣ㄦ寜 SPEC 0.1 鏀惧鍒?鍙湁 flexible 鎵嶈兘缂╂按"
    const required = task.durationMin > 0 ? task.durationMin : 15;
    if (minutes < required) {
      issues.push(
        `銆?{task.title}銆嶈鍘嬬缉鍒?${formatDuration(minutes)}锛屼笉灏戜簬鍘熷畾 ${formatDuration(required)}`,
      );
    }

    const windowIssue = windowViolation(shape, config);
    if (windowIssue) issues.push(`銆?{task.title}銆?{windowIssue}`);

    const deadlineIssue = deadlineViolation(task, shape.endMs);
    if (deadlineIssue) issues.push(`銆?{task.title}銆?{deadlineIssue}`);
  }

  // 鍏ㄥ眬涓ょ溂锛氫笌 adjudicateProposal 鍏辩敤鍚屼竴浠藉疄鐜帮紝鎺緸鎸夋棫璋冪敤鏂逛範鎯炕璇?  const after = applyPlan(tasks, plan);
  const touched = new Set(after.map((task) => task.id));
  for (const violation of validateWhole(after, tasks, touched, detect)) {
    switch (violation.kind) {
      case "overlap": {
        const [first, second] = violation.taskIds;
        issues.push(`鏂规鍐呴儴閲嶅彔锛氥€?{titleOf(first ?? "")}銆嶄笌銆?{titleOf(second ?? "")}銆峘);
        break;
      }
      case "capacity":
        issues.push(violation.reason.replace("瓒呰繃姣忔棩涓婇檺", "瓒呰繃涓婇檺"));
        break;
      default:
        issues.push(violation.reason);
    }
  }

  return { ok: issues.length === 0, issues };
}

/** 鍐欏洖锛氭妸鏂规閲岀殑鏃堕棿鍧楀簲鐢ㄥ埌浠诲姟涓婏紝杩斿洖鏂版暟缁勶紙涓嶆敼鍘熸暟缁勶級 */
export function applyPlan(tasks: readonly Task[], plan: ReplanPlan): Task[] {
  const byTaskId = new Map(plan.blocks.map((b) => [b.taskId, b]));
  return tasks.map((task) => {
    const block = byTaskId.get(task.id);
    if (!block) return task;
    const startMs = parseIsoToMs(block.start);
    const endMs = parseIsoToMs(block.end);
    if (startMs === null || endMs === null || endMs <= startMs) return task;
    return {
      ...task,
      start: block.start,
      end: block.end,
      durationMin: Math.round((endMs - startMs) / MS_MINUTE),
    };
  });
}

/**
 * 鏈湴鍏滃簳鏂规鐢熸垚鍣紙demo 妯″紡 / 鏃犲瘑閽?/ 妯″瀷鏂规鍏ㄨ涓㈠純鏃朵娇鐢級銆? * 纭畾鎬х畻娉曪細鎺掑簭绛栫暐涓嶅悓 鈫?浜у嚭鐨勬柟妗堜笉鍚岋紝浣嗗叏閮ㄩ€氳繃 validatePlan銆? */
export function buildLocalPlans(
  tasks: readonly Task[],
  dayKey: string,
  options: PlanOptions = DEFAULT_PLAN_OPTIONS,
): ReplanPlan[] {
  const candidates = tasks.filter((t) => !t.done && t.durationMin > 0);
  if (candidates.length === 0) return [];

  const deadlineOf = (t: Task): number => parseIsoToMs(t.deadline) ?? Number.POSITIVE_INFINITY;

  const policies = [
    {
      id: "local-priority",
      title: "鏂规涓€ 路 浼樺厛绾т紭鍏?,
      rationale:
        "鍏堝仛绱ф€ヤ换鍔★紝鎶婂綋鏃ユ渶纭殑楠ㄥご鏀惧湪鐘舵€佹渶濂界殑鍓嶇疆鏃舵锛涚紦鍐?15 鍒嗛挓锛屼笉鎻掑崍浼戙€?,
      order: (a: Task, b: Task) => a.priority - b.priority || deadlineOf(a) - deadlineOf(b),
      extraGapMin: 0,
    },
    {
      id: "local-deadline",
      title: "鏂规浜?路 鎴鏃ヤ紭鍏?,
      rationale:
        "鎸?DDL 椤哄簭鎺ㄨ繘锛屽厛娓呮帀鏈€瀹规槗閫炬湡鐨勪簨锛涙瘡涓ゅ潡涔嬮棿澶氱暀 10 鍒嗛挓鍥炶銆?,
      order: (a: Task, b: Task) => deadlineOf(a) - deadlineOf(b) || a.priority - b.priority,
      extraGapMin: 10,
    },
  ];

  const plans: ReplanPlan[] = [];
  for (const policy of policies) {
    const ordered = [...candidates].sort(policy.order);
    const blocks: PlanBlock[] = [];
    let cursor = msFromDayKey(dayKey, options.dayStartMin);
    const dayEndMs = msFromDayKey(dayKey, options.dayEndMin);

    for (const task of ordered) {
      const durationMs = task.durationMin * MS_MINUTE;
      if (cursor + durationMs > dayEndMs) break;
      blocks.push({
        taskId: task.id,
        start: new Date(cursor).toISOString(),
        end: new Date(cursor + durationMs).toISOString(),
      });
      cursor += durationMs + (options.bufferMin + policy.extraGapMin) * MS_MINUTE;
    }

    if (blocks.length === 0) continue;
    const plan: ReplanPlan = {
      id: policy.id,
      title: policy.title,
      rationale: `${policy.rationale}锛堟湰鍦扮‘瀹氭€х畻娉曠敓鎴愶紝鏈皟鐢ㄦā鍨嬶級`,
      blocks,
    };
    if (validatePlan(plan, tasks, dayKey, options).ok) plans.push(plan);
  }
  return plans;
}

/** 鏂规鎽樿锛氳鐩栧嚑椤广€佸叡澶氬皯鍒嗛挓銆佹渶鏅氬埌鍑犵偣锛圲I 鍗＄墖椤堕儴灞曠ず锛?*/
export function summarizePlan(plan: ReplanPlan): {
  count: number;
  totalMin: number;
  lastEnd: string;
} {
  const intervals = plan.blocks
    .map((b) => ({ s: parseIsoToMs(b.start), e: parseIsoToMs(b.end) }))
    .filter((x): x is { s: number; e: number } => x.s !== null && x.e !== null);
  const totalMin = intervals.reduce((sum, x) => sum + Math.round((x.e - x.s) / MS_MINUTE), 0);
  const lastEndMs = intervals.reduce((max, x) => Math.max(max, x.e), 0);
  return {
    count: plan.blocks.length,
    totalMin,
    lastEnd: lastEndMs === 0 ? "鈥? : formatClock(lastEndMs),
  };
}
}
