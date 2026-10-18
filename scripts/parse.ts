/**
 * 解析命令行入口 —— 把一段文本走完整的 AI 解析链路，结果打到终端。
 *
 * 存在意义有三：
 *  1. 演示视频需要一段"真实执行"的录屏，而不是只点界面；
 *  2. 调 prompt 时不必每次开浏览器；
 *  3. 让"解析质量"这件事可被命令行验证，评委也能自己复跑。
 *
 * 设计约束：
 *  - 只读文件、只打印，不写数据库、不产生副作用；
 *  - 无 LLM_API_KEY 时走 demo provider，但必须在第一行打印 [demo mode]，
 *    避免把固定 mock 误当成真实模型输出（这条在录屏时尤其重要）；
 *  - dayKey 由 DEMO_NOW 注入，绝不读系统时钟——演示素材里的日期是写死的，
 *    用系统时间会让"本周/下周"整体漂移。
 *
 * 用法：
 *   npm run parse -- docs/demo-fixtures/notice.txt
 *   npm run parse -- docs/demo-fixtures/notice.txt --day-key 2026-10-19
 *   npm run parse -- docs/demo-fixtures/notice.txt --out out/parse-result.json
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { readAiConfig } from "../src/ai/client";
import { parseTasksFromText } from "../src/ai/tasks";

const DEFAULT_DEMO_NOW = "2026-10-19T09:00:00+08:00";

const USAGE = [
  "用法：npm run parse -- <文件路径> [--day-key YYYY-MM-DD] [--out 输出路径]",
  "",
  "示例：npm run parse -- docs/demo-fixtures/notice.txt",
].join("\n");

interface CliOptions {
  file: string;
  dayKey: string;
  outPath: string | null;
  demoNow: string;
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

/** 从 DEMO_NOW（或 --day-key）取"今天"，不读系统时钟 */
function resolveDayKey(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (match === null) fail(`DEMO_NOW 不是合法 ISO 时间：${iso}`);
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function readFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    fail(`${flag} 后面缺少取值\n${USAGE}`);
  }
  return value;
}

function parseArgs(argv: string[]): CliOptions {
  const positional: string[] = [];
  let dayKeyArg: string | null = null;
  let outPath: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (arg === "--day-key") {
      dayKeyArg = readFlagValue(argv, i, "--day-key");
      i += 1;
    } else if (arg === "--out") {
      outPath = readFlagValue(argv, i, "--out");
      i += 1;
    } else if (arg.startsWith("--")) {
      fail(`未知参数：${arg}\n${USAGE}`);
    } else {
      positional.push(arg);
    }
  }

  const file = positional[0];
  if (file === undefined) fail(USAGE);

  const demoNow = process.env.DEMO_NOW?.trim() || DEFAULT_DEMO_NOW;
  return { file, dayKey: dayKeyArg ?? resolveDayKey(demoNow), outPath, demoNow };
}

/**
 * 下游提前关闭管道（`| head`、PowerShell 的 `| Select-Object -First N`）时，
 * 往 stdout 写会抛 EPIPE。这是"消费者不需要更多输出"，不是程序失败 ——
 * 以 0 退出即可，否则录屏时终端会挂红字，看起来像崩了（映像官实测到过）。
 */
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const absolute = resolve(options.file);

  let text: string;
  try {
    text = readFileSync(absolute, "utf8");
  } catch {
    fail(`读不到文件：${absolute}`);
  }

  const config = readAiConfig();

  // 第一行必须显式标出当前模式：录屏时这一行是"这不是真实模型"的唯一提示
  process.stdout.write(
    config.mode === "demo"
      ? "[demo mode] 未配置 LLM_API_KEY，使用固定规则的本地 mock 输出（非真实模型返回）\n"
      : `[live] 模型 ${config.model} @ ${config.baseURL ?? "默认端点"}\n`,
  );
  process.stdout.write(
    `[clock] dayKey=${options.dayKey}（来自 ${process.env.DEMO_NOW ? "环境变量 DEMO_NOW" : "默认 DEMO_NOW"}，不读系统时钟）\n`,
  );
  process.stdout.write(
    `[input] ${absolute}（${Buffer.byteLength(text, "utf8")} 字节）\n\n`,
  );

  const result = await parseTasksFromText({ text, dayKey: options.dayKey }, config);

  if (options.outPath !== null) {
    const outAbsolute = resolve(options.outPath);
    mkdirSync(dirname(outAbsolute), { recursive: true });
    writeFileSync(outAbsolute, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (result.ok) {
    const needReview = result.tasks.filter((task) => task.needsReview === true).length;
    const coverage = result.coverage;
    process.stdout.write(
      `\n[summary] 解析出 ${result.tasks.length} 条任务，其中 ${needReview} 条待人工确认（needsReview）\n`,
    );
    process.stdout.write(
      coverage.verified
        ? `[coverage] 原文 ${coverage.totalLines} 行 → 已归属 ${coverage.coveredCount} 行` +
            `（${Math.round(coverage.ratio * 100)}%），日期上下文 ${coverage.contextLines.length} 行，` +
            `没看懂 ${coverage.uncovered.length} 行\n`
        : `[coverage] 图片路径：本地未复核原文（${coverage.uncovered.length} 条需人工核对）\n`,
    );
    for (const line of coverage.uncovered) {
      process.stdout.write(`[coverage] 待确认 · 第 ${line.lineNo} 行：${line.text}（${line.reason}）\n`);
    }
    if (options.outPath !== null) {
      process.stdout.write(`[summary] 结果已写入 ${options.outPath}\n`);
    }
    return;
  }

  process.stdout.write(`\n[summary] 解析失败：${result.error}\n`);
  if (result.issues.length > 0) {
    process.stdout.write(`[summary] 失败明细：\n- ${result.issues.join("\n- ")}\n`);
  }
  process.exitCode = 1;
}

void main();
