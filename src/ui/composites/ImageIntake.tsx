"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { Badge, Button, Input, Label } from "@/ui/primitives";

/**
 * 图片录入入口 —— 只负责"选中一张图 + 可选补一句话"，不做压缩、不发请求
 * （压缩与请求在 intakeClient.ts，保持组件纯粹、可单独摆布）。
 *
 * 为什么要 capture="environment"：手机上直接调后置摄像头拍纸质作业，
 * 少一步"先拍照再进相册再上传"，这是主管定的"随手一记"的一部分。
 */
const ACCEPT = "image/png,image/jpeg,image/webp";

export function ImageIntake({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (file: File, hint: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 只做清理：不动 state，避免"在 effect 里同步 setState"引发的级联渲染
  useEffect(() => {
    return () => {
      if (previewUrl !== null) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function pick(next: File | null) {
    if (next === null) return;
    if (previewUrl !== null) URL.revokeObjectURL(previewUrl);
    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
  }

  function clear() {
    if (previewUrl !== null) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
    if (inputRef.current !== null) inputRef.current.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped !== undefined) pick(dropped);
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={
          "flex flex-col items-center justify-center gap-2 rounded-sm border border-dashed px-4 py-6 text-center transition-colors " +
          (dragging
            ? "border-brand-400 bg-brand-500/10"
            : "border-ink-600 bg-ink-950/40 hover:border-ink-500")
        }
      >
        {previewUrl !== null ? (
          <>
            {/* 本地预览用原生 img：这里必须显示用户刚选的那张图，不经过任何优化管线 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="待识别的图片预览"
              className="max-h-56 w-auto rounded-sm ring-1 ring-inset ring-ink-600"
            />
            <p className="text-micro text-ink-300">
              {file?.name ?? "已选图片"} · {Math.round((file?.size ?? 0) / 1024)} KB
              <span className="text-ink-400">（上传前会压到长边 1400px）</span>
            </p>
          </>
        ) : (
          <>
            <p className="text-caption text-ink-200">把课表截图 / 群通知截图 / 作业照片拖进来</p>
            <p className="text-micro text-ink-400">或点下面的按钮选图，手机上会直接调摄像头</p>
          </>
        )}

        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="secondary"
            className="h-8 px-3 text-micro"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {file === null ? "选图 / 拍照" : "换一张"}
          </Button>
          {file !== null ? (
            <Button variant="ghost" className="h-8 px-3 text-micro" onClick={clear} disabled={busy}>
              清空
            </Button>
          ) : null}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          capture="environment"
          className="hidden"
          onChange={(event) => pick(event.target.files?.[0] ?? null)}
        />
      </div>

      <div>
        <Label htmlFor="image-hint">
          补充一句（可选）—— 图上没写的日期/时长在这里补，比不补准
        </Label>
        <Input
          id="image-hint"
          value={hint}
          maxLength={500}
          placeholder="例如：这张课表是这学期的，周三那节课下周调到周四"
          onChange={(event) => setHint(event.target.value)}
          disabled={busy}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => file !== null && onSubmit(file, hint)} disabled={file === null || busy}>
          {busy ? "识别中…" : "识别这张图"}
        </Button>
        <Badge tone="neutral">PNG · JPG · WebP</Badge>
        <span className="text-micro text-ink-400">识别结果同样要过人工核对表，不会直接入库</span>
      </div>
    </div>
  );
}
