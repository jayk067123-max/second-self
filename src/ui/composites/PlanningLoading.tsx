import { useId } from "react";

/** A small, self-contained orchard inspired by the supplied brush animation. */
export function PlanningLoading({ label }: { label: string }) {
  const paperId = useId();
  return <div className="planning-loading" role="status" aria-live="polite" aria-atomic="true">
    <svg className="planning-orchard" viewBox="0 0 320 140" width="320" height="140" aria-hidden="true" focusable="false">
      <defs><filter id={paperId} x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".65" numOctaves="2" seed="8" /><feColorMatrix type="saturate" values="0" /><feComponentTransfer><feFuncA type="linear" slope=".055" /></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply" /></filter></defs>
      <g filter={"url(#" + paperId + ")"}>
        <path fill="#f5f1e7" d="M23 96C9 70 34 19 83 26c38-27 74-6 99-7 44-9 105 13 111 49 8 44-49 59-103 53-62 18-146 12-167-25Z" />
        <circle className="orchard-sun" cx="242" cy="36" r="16" fill="#f1dd85" />
        <path fill="#dde6bf" d="M26 101c30-26 61-19 88-5 35-32 74-27 106-9 27-14 50-6 68 15-42 26-211 31-262-1Z" />
        <path fill="#c9d9a5" d="M30 108c42-15 74 4 107-2 43-22 91-5 141 3-48 21-196 23-248-1Z" />
        <g className="orchard-tree orchard-tree-one" style={{ transformOrigin: "91px 108px" }}>
          <path className="orchard-branch" d="M91 109c1-19-3-42-1-65m1 41L73 68m18 9 17-19" />
          <g className="orchard-crown" style={{ transformOrigin: "90px 61px" }}>
            <path fill="#9fbe7b" d="M58 69c-13-17-4-36 12-37 3-18 26-19 35-7 19-5 34 15 23 29 10 20-7 34-24 29-19 12-43 5-46-14Z" />
            <path fill="#bfd394" d="M59 54c-3-16 11-22 21-17 6-14 25-13 30 0 11-1 17 7 13 16-20-6-36 11-64 1Z" />
            <path fill="#789e66" opacity=".45" d="M60 71c18 8 33-8 47-5 12-1 16-9 23-9 5 18-9 28-26 24-17 10-38 7-44-10Z" />
          </g>
        </g>
        <g className="orchard-tree orchard-tree-two" style={{ transformOrigin: "192px 112px" }}>
          <path className="orchard-branch" d="M192 114c-2-21 3-38 0-53m0 31-15-14m16 6 15-14" />
          <g className="orchard-crown" style={{ transformOrigin: "193px 68px" }}>
            <path fill="#b3cb8e" d="M165 77c-9-12-3-27 10-29 1-13 18-17 28-7 14-5 29 7 24 20 9 15-2 29-16 29-18 11-39 3-46-13Z" />
            <path fill="#d1dfad" d="M168 63c-1-12 11-17 20-13 6-10 19-9 23 1 12-2 15 6 12 14-20-8-32 9-55-2Z" />
          </g>
        </g>
        <g className="orchard-blossoms" fill="#efc8b7">
          <circle cx="72" cy="47" r="3" /><circle cx="100" cy="39" r="3.5" /><circle cx="115" cy="61" r="3" /><circle cx="78" cy="70" r="2.5" /><circle cx="181" cy="65" r="3" /><circle cx="209" cy="73" r="3.5" />
        </g>
        <g className="orchard-note" style={{ transformOrigin: "145px 93px" }}>
          <rect x="125" y="65" width="40" height="43" rx="8" fill="#fdfbf4" stroke="#b4c69b" />
          <path d="M126 77h38" stroke="#d9e4c1" /><path d="M136 62v7m17-7v7" stroke="#78965f" strokeWidth="3" strokeLinecap="round" />
          <path className="orchard-check" d="m135 91 6 6 12-13" fill="none" stroke="#6f9654" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <path className="orchard-grass" d="m54 113-2-7m3 8 3-5m161 8 3-8m-2 9 7-4m-110 8-2-6m-1 6 5-4" fill="none" stroke="#89a66d" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
    <span className="planning-loading-label">{label}<span className="planning-loading-dots" aria-hidden="true"><i /><i /><i /></span></span>
  </div>;
}
