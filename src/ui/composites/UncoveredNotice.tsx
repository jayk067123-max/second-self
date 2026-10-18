"use client";

import type { CoverageReport, SourceLine } from "@/domain/completeness";
import { Badge, Button } from "@/ui/primitives";

/**
 * 完整性校验面板 —— 「任何一行原文都不许静默丢掉」的用户可见面。
 *
 * 数据由服务端用原文重算（src/domain/completeness.ts），不是模型自述。
 * 界面上只有三种结局，没有第四种：
 *   1. 已变成任务（计数）
 *   2. 纯日期/星期上下文行（折叠展示，说明它被后面的任务吸收了）
 *   3. 没看懂 → 列出来，用户「转成任务」或「这行不重要」
 * 任何一种都必须看得见，所以这里禁止"空数组就不渲染"的写法。
 */
export function UncoveredNotice({
  coverage,
  dismissedLineNos,
  adoptedLineNos,
  onAdopt,
  onDismiss,
  onRestore,
}: {
  coverage: CoverageReport;
  dismissedLineNos: readonly number[];
  /** 已经补成任务的行：从待确认列表里消失，改在修正表里出现 */
  adoptedLineNos: readonly number[];
  onAdopt: (line: SourceLine) => void;
  onDismiss: (lineNo: number) => void;
  onRestore: (lineNo: number) => void;
}) {
  const pending = coverage.uncovered.filter(
    (line) => !dismissedLineNos.includes(line.lineNo) && !adoptedLineNos.includes(line.lineNo),
  );
  const dismissed = coverage.uncovered.filter((line) => dismissedLineNos.includes(line.lineNo));

  if (!coverage.verified) {
    return (
      <div className="rounded-sm bg-warn-500/10 px-3 py-2 ring-1 ring-inset ring-warn-500/30">
        <p className="text-caption font-medium text-warn-400">图片路径：原文没能在本地复核</p>
        <p className="mt-1 text-micro leading-relaxed text-ink-300">
          图里的字是模型读出来的，本地没有原文可比对，所以不显示覆盖率。
          请对着图片逐条核对下面的草稿；图上有、这里没有的，用「手动新增」补一条。
        </p>
        {coverage.uncovered.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1">
            {coverage.uncovered.map((line) => (
              <li key={line.lineNo} className="text-micro text-warn-400">
                {line.text} · {line.reason}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-sm bg-ink-950/50 px-3 py-2.5 ring-1 ring-inset ring-ink-700">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={pending.length > 0 ? "warn" : "ok"}>
          {pending.length > 0 ? `有 ${pending.length} 行待你确认` : "原文已全部认领"}
        </Badge>
        <span className="text-micro text-ink-300">
          原文 {coverage.totalLines} 行 · 已变成任务 {coverage.coveredCount} 行 · 覆盖率{" "}
          {Math.round(coverage.ratio * 100)}%
        </span>
      </div>

      {coverage.contextLines.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer select-none text-micro text-ink-400">
            另有 {coverage.contextLines.length} 行是日期/星期上下文，被后面的任务吸收（点开看）
          </summary>
          <ul className="mt-1 flex flex-col gap-0.5 font-mono text-[11px] text-ink-400">
            {coverage.contextLines.map((line) => (
              <li key={`ctx-${line.lineNo}`}>
                第 {line.lineNo} 行：{line.text}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {pending.length > 0 ? (
        <ul className="mt-2.5 flex flex-col gap-1.5">
          {pending.map((line) => (
            <li
              key={line.lineNo}
              className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-warn-500/10 px-2 py-1.5 ring-1 ring-inset ring-warn-500/25"
            >
              <div className="min-w-0 flex-1">
                <p className="text-micro text-warn-400">{line.reason}</p>
                <p className="truncate text-caption text-ink-100" title={line.text}>
                  第 {line.lineNo} 行：{line.text}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="secondary"
                  className="h-7 px-2.5 text-micro"
                  onClick={() => onAdopt(line)}
                >
                  转成任务
                </Button>
                <Button
                  variant="ghost"
                  className="h-7 px-2 text-micro"
                  onClick={() => onDismiss(line.lineNo)}
                >
                  这行不重要
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {dismissed.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-micro text-ink-400">已标记不重要 {dismissed.length} 行：</span>
          {dismissed.map((line) => (
            <button
              key={`dismissed-${line.lineNo}`}
              type="button"
              className="rounded-pill bg-ink-800 px-2 py-0.5 text-micro text-ink-400 hover:text-ink-100"
              onClick={() => onRestore(line.lineNo)}
              title={line.text}
            >
              第 {line.lineNo} 行 · 撤销
            </button>
          ))}
        </div>
      ) : null}

      <p className="mt-2 border-t border-ink-700 pt-1.5 text-[11px] leading-relaxed text-ink-400">
        这一栏由服务端拿原文逐行重算，不采信模型自述 —— 漏掉一行 DDL 比解析错更严重，所以宁可多问一句。
      </p>
    </div>
  );
}
