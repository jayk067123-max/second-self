"use client";
import type { CoverageReport, SourceLine } from "@/domain/completeness";
export function UncoveredNotice({coverage,dismissedLineNos,adoptedLineNos,onAdopt,onDismiss,onRestore}: {
  coverage: CoverageReport; dismissedLineNos: readonly number[]; adoptedLineNos: readonly number[];
  onAdopt: (line:SourceLine) => void; onDismiss:(n:number) => void; onRestore:(n:number) => void;
}) {
  const pending = coverage.uncovered.filter(l => !dismissedLineNos.includes(l.lineNo) && !adoptedLineNos.includes(l.lineNo));
  return <div className="uncovered-list">{pending.length ? <p>选择保留或忽略，避免遗漏。</p> : <p className="resolved-label">✓ 已处理完毕</p>}
    {pending.map(line => <div className="uncovered-item" key={line.lineNo}><p>{line.text}</p><div className="settings-actions"><button className="btn btn-green" onClick={() => onAdopt(line)}>转成任务</button><button className="btn" onClick={() => onDismiss(line.lineNo)}>忽略</button></div></div>)}
    {dismissedLineNos.map(n => <button className="restore-line" key={n} onClick={() => onRestore(n)}>恢复第 {n} 行</button>)}
  </div>;
}
