import {
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_DATA_URL_LENGTH,
  ParseTasksResponseSchema,
  type ParseTasksSuccess,
} from "@/domain/schemas/api";

/**
 * 录入侧唯一的**取数出口**（ARCHITECTURE §2 + ui/README：fetch 必须收敛到一个文件）。
 *
 * 为什么单独成文件：
 *  - 组件只管画和状态，不关心 URL、header、压缩参数；
 *  - 图片压缩是浏览器 API（canvas），只能待在 client 侧，但它是**纯函数形态**的
 *    （File 进 → data URL 出），可以单独推理、单独替换；
 *  - 服务端返回一律先过 zod 契约再用，不信任任何外部结构。
 */

/**
 * 压缩档位：长边 1400px。理由：课表截图上的小字在 1400px 下仍可读，体积降到 ~1/6。
 * 还太长就降一档再试（换手机原图时会走到第二、三档）。
 */
const FALLBACK_STEPS: ReadonlyArray<{ maxEdge: number; quality: number }> = [
  { maxEdge: 1400, quality: 0.8 },
  { maxEdge: 1100, quality: 0.72 },
  { maxEdge: 900, quality: 0.65 },
];

export type IntakeOutcome =
  | { kind: "ok"; response: ParseTasksSuccess }
  | { kind: "fail"; message: string; issues: string[]; raw?: string };

export interface CompressedImage {
  dataUrl: string;
  width: number;
  height: number;
  /** 压缩后的近似字节数（base64 长度 × 3/4），用于界面显示，不做精确计算 */
  bytes: number;
}

/** 把技术错误翻译成用户能照做的话 */
function describeImageError(file: File): string | null {
  const type = file.type.toLowerCase();
  if (type === "image/heic" || type === "image/heif" || file.name.toLowerCase().endsWith(".heic")) {
    return "iPhone 的 HEIC 格式浏览器解不开。请在相册里把它另存为 JPG，或直接对着屏幕截一张图再上传。";
  }
  if (type.length > 0 && !(ALLOWED_IMAGE_MIME as readonly string[]).includes(type)) {
    return `不支持这种图片格式（${type}）。请上传 PNG / JPG / WebP。`;
  }
  return null;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // 部分浏览器对某些 JPEG 变体不支持 createImageBitmap，退回 <img> 解码
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("图片解码失败，文件可能已损坏"));
      img.src = url;
    });
  } finally {
    // 解码完成（或失败）后即可释放；img 已持有像素数据
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * 选中的文件 → 可上传的 data URL。
 * 三段降档重试，全部超标才报错（报错也比传一个 8MB 的包被服务端拒绝好）。
 */
export async function compressImageFile(file: File): Promise<CompressedImage> {
  const rejected = describeImageError(file);
  if (rejected !== null) throw new Error(rejected);

  const bitmap = await loadBitmap(file);
  const sourceWidth = "width" in bitmap ? bitmap.width : 0;
  const sourceHeight = "height" in bitmap ? bitmap.height : 0;
  if (sourceWidth === 0 || sourceHeight === 0) throw new Error("图片尺寸读不出来，换一张图试试");

  let last: CompressedImage | null = null;
  for (const step of FALLBACK_STEPS) {
    const scale = Math.min(1, step.maxEdge / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("浏览器不支持 canvas，无法压缩图片。请改用「粘贴文本」入口。");
    // 透明 PNG 转 JPEG 会变黑底：先铺白
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", step.quality);
    last = {
      dataUrl,
      width,
      height,
      bytes: Math.round((dataUrl.length * 3) / 4),
    };
    if (dataUrl.length <= MAX_IMAGE_DATA_URL_LENGTH) return last;
  }

  throw new Error(
    `这张图压缩后仍然太大（${Math.round((last?.bytes ?? 0) / 1024)} KB）。请裁剪到只保留日程部分再传。`,
  );
}

async function postParse(url: string, body: unknown): Promise<IntakeOutcome> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      kind: "fail",
      message: "请求没能发出去：检查网络，或确认本地服务还在运行",
      issues: [],
    };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return {
      kind: "fail",
      message: `服务端返回了非 JSON 内容（HTTP ${response.status}），这不是我们的契约，已拒绝使用`,
      issues: [],
    };
  }

  const parsed = ParseTasksResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      kind: "fail",
      message: "服务端返回结构不符合契约，已拒绝使用",
      issues: parsed.error.issues.slice(0, 4).map((i) => `${i.path.join(".") || "(根)"}: ${i.message}`),
    };
  }
  if (!parsed.data.ok) {
    return {
      kind: "fail",
      message: parsed.data.error,
      issues: parsed.data.issues,
      raw: parsed.data.raw,
    };
  }
  return { kind: "ok", response: parsed.data };
}

export function requestParseText(input: { text: string; dayKey: string }): Promise<IntakeOutcome> {
  return postParse("/api/ai/parse-tasks", { text: input.text.trim(), dayKey: input.dayKey });
}

export async function requestParseImage(input: {
  file: File;
  dayKey: string;
  hint?: string;
}): Promise<IntakeOutcome> {
  let compressed: CompressedImage;
  try {
    compressed = await compressImageFile(input.file);
  } catch (error) {
    return {
      kind: "fail",
      message: error instanceof Error ? error.message : "图片处理失败",
      issues: [],
    };
  }
  const body: Record<string, unknown> = {
    imageDataUrl: compressed.dataUrl,
    dayKey: input.dayKey,
  };
  if (input.hint !== undefined && input.hint.trim().length > 0) body.hint = input.hint.trim();
  return postParse("/api/ai/parse-image", body);
}
