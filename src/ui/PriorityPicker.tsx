"use client";
import { PRIORITY_LABEL } from "@/domain/schemas/task";
export function PriorityPicker({ value, onChange, label = "优先级" }: { value: number; onChange: (value: 1 | 2 | 3) => void; label?: string }) {
  return <div className="priority-picker" role="group" aria-label={label}>{([3, 2, 1] as const).map(p => <button type="button" key={p} aria-pressed={value === p} className={"priority-option priority-" + p} onClick={() => onChange(p)}><span aria-hidden="true">{p === 1 ? "▲" : p === 2 ? "●" : "○"}</span>{PRIORITY_LABEL[p]}</button>)}</div>;
}
