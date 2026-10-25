"use client";

import { useId } from "react";

export function FixedArrangementField({ checked, onChange, className = "" }: {
  checked: boolean; onChange: (checked: boolean) => void; className?: string;
}) {
  const hintId = useId();
  return <div className={"fixed-arrangement-field " + className}>
    <label className="checkbox-field"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} aria-describedby={hintId} />固定安排</label>
    <p id={hintId}>必要安排，自动重排时不移动；仍可手动修改。</p>
  </div>;
}
