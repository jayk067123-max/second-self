"use client";

import { IntakePanel } from "./IntakePanel";
import { ManualAddForm } from "./ManualAddForm";
import { TimetableReuploadPanel } from "./TimetableReuploadPanel";

/**
 * 「随手记」页 —— 三个录入入口，别的什么都不放。
 *
 * 顺序就是使用频率：大面积粘贴（群通知/课表）在最上面，
 * 手动补一条其次，重传课表（低频、有覆盖风险）放最后。
 * 这三张卡是三件不同的事，不做折叠：用户点进来就是要录东西。
 */
export function TabCapture() {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="px-1 text-micro text-ink-400">
        粘一段、拍一张都行。漏掉的每一行我都会回头问你，不会静默丢掉。
      </p>
      <IntakePanel />
      <ManualAddForm />
      <TimetableReuploadPanel />
    </div>
  );
}
