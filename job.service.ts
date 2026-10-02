import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { ErrorCode, JobEvent, JobStatus } from "../types/jobs.js";
import { safeError } from "./error-mapper.service.js";

const ROOT = process.env.DOWNLOAD_DIR ?? "/tmp/video-downloader";
const TTL_MS = Number(process.env.FILE_TTL_MINUTES ?? 30) * 60_000;
const MAX_BYTES = Number(process.env.MAX_FILE_SIZE_BYTES ?? 524_288_000);
const MAX_RUNTIME_MS = Number(process.env.MAX_JOB_RUNTIME_MINUTES ?? 60) * 60_000;

export interface DownloadJob {
  id: string;
  accessToken: string;
  url: string;
  formatId?: string;
  status: JobStatus;
  progress: number;
  stage: string;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  retryable: boolean;
  outputPath?: string;
  fileName?: string;
  fileSize?: number;
  expiresAt?: string;
  errorCode?: ErrorCode;
  errorMessage?: string;
}

const jobs = new Map<string, DownloadJob>();
const processes = new Map<string, ChildProcess>();
const events = new EventEmitter();
const terminal = new Set<JobStatus>(["completed", "failed", "cancelled", "expired"]);

function emit(job: DownloadJob, type: JobEvent["type"] = "status") {
  events.emit(job.id, {
    type,
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    retryable: job.retryable,
    timestamp: new Date().toISOString(),
  } satisfies JobEvent);
}

function setState(job: DownloadJob, status: JobStatus, progress: number, stage: string) {
  job.status = status;
  job.progress = Math.max(0, Math.min(100, Math.round(progress)));
  job.stage = stage;
  job.updatedAt = new Date().toISOString();
  emit(job);
}

function formatSelector(formatId: string | undefined, sourceUrl: string) {
  const format = (formatId ?? "mp4-720").toLowerCase();
  const isDirect = /\.(mp4|webm|mp3|m4a)(?:$|[?#])/i.test(sourceUrl);
  if (isDirect && format === "original") return { selector: "best", postArgs: [] };
  if (format.includes("mp3")) return { selector: "bestaudio/best", postArgs: ["--extract-audio", "--audio-format", "mp3", "--audio-quality", "0"] };
  if (format.includes("m4a")) return { selector: "bestaudio/best", postArgs: ["--extract-audio", "--audio-format", "m4a"] };
  const match = format.match(/(1080|720|480|360)/);
  const height = match?.[1] ?? "720";
  return { selector: `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`, postArgs: ["--merge-output-format", "mp4"] };
}

async function findOutput(dir: string) {
  const files = (await readdir(dir)).filter((file) => !file.endsWith(".part") && !file.endsWith(".ytdl"));
  if (!files.length) throw new Error("output file was not created");
  const withStats = await Promise.all(files.map(async (file) => ({ file, size: (await stat(path.join(dir, file))).size })));
  const output = withStats.sort((a, b) => b.size - a.size)[0];
  if (output.size <= 0 || output.size > MAX_BYTES) throw new Error(output.size > MAX_BYTES ? "file too large" : "empty output");
  return { path: path.join(dir, output.file), fileName: output.file, size: output.size };
}

function classify(error: unknown): ErrorCode {
  const text = error instanceof Error ? error.message.toLowerCase() : "";
  if (text.includes("too large")) return "FILE_TOO_LARGE";
  if (text.includes("timeout")) return "NETWORK_TIMEOUT";
  if (text.includes("429") || text.includes("rate")) return "PROVIDER_RATE_LIMITED";
  if (text.includes("format") || text.includes("requested format")) return "FORMAT_UNAVAILABLE";
  return "INTERNAL_ERROR";
}

async function runDownload(job: DownloadJob) {
  const dir = path.join(ROOT, job.id);
  await mkdir(dir, { recursive: true });
  const { selector, postArgs } = formatSelector(job.formatId, job.url);
  const outputTemplate = path.join(dir, "source.%(ext)s");
  const args = [
    "--no-playlist", "--no-warnings", "--newline", "--restrict-filenames",
    "--socket-timeout", "20", "--retries", "2", "--max-filesize", `${MAX_BYTES}`,
    "--format", selector, ...postArgs, "--output", outputTemplate, "--", job.url,
  ];
  setState(job, "inspecting", 5, "فحص الرابط");
  const child = spawn(process.env.YTDLP_BIN ?? "yt-dlp", args, { shell: false, cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
  processes.set(job.id, child);
  let stderr = "";
  const onOutput = (chunk: Buffer | string) => {
    const text = String(chunk);
    stderr = (stderr + text).slice(-8_000);
    const match = text.match(/(\d+(?:\.\d+)?)%/);
    if (match) setState(job, "processing", Number(match[1]), "جارٍ تحميل الفيديو");
  };
  child.stdout.on("data", onOutput);
  child.stderr.on("data", onOutput);
  const timeout = setTimeout(() => child.kill("SIGKILL"), MAX_RUNTIME_MS);
  try {
    const code = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (exitCode, signal) => resolve(exitCode ?? (signal ? 1 : 0)));
    });
    if (code !== 0) throw new Error(stderr || `yt-dlp exited with code ${code}`);
    setState(job, "converting", 90, "تجهيز الصيغة");
    const result = await findOutput(dir);
    job.outputPath = result.path;
    job.fileName = result.fileName;
    job.fileSize = result.size;
    job.expiresAt = new Date(Date.now() + TTL_MS).toISOString();
    job.retryable = false;
    setState(job, "completed", 100, "اكتمل التنزيل");
    setTimeout(() => expire(job.id), TTL_MS).unref();
  } catch (error) {
    const code = classify(error);
    const safe = safeError(code);
    job.errorCode = safe.errorCode;
    job.errorMessage = safe.errorMessage;
    job.retryable = safe.retryable;
    setState(job, "failed", job.progress, safe.errorMessage);
    await rm(dir, { recursive: true, force: true });
  } finally {
    clearTimeout(timeout);
    processes.delete(job.id);
  }
}

async function expire(id: string) {
  const job = jobs.get(id);
  if (!job || job.status !== "completed") return;
  if (job.outputPath) await rm(path.dirname(job.outputPath), { recursive: true, force: true });
  job.outputPath = undefined;
  job.fileName = undefined;
  job.fileSize = undefined;
  job.status = "expired";
  job.stage = "انتهت صلاحية الملف وتم حذفه";
  job.updatedAt = new Date().toISOString();
  emit(job);
  setTimeout(() => jobs.delete(id), 60 * 60_000).unref();
}

export const jobService = {
  create(url: string, formatId?: string) {
    const now = new Date().toISOString();
    const job: DownloadJob = { id: randomUUID(), accessToken: randomBytes(32).toString("hex"), url, formatId, status: "queued", progress: 0, stage: "تمت الإضافة إلى قائمة الانتظار", createdAt: now, updatedAt: now, attempts: 0, retryable: true };
    jobs.set(job.id, job);
    emit(job);
    void runDownload(job);
    return job;
  },
  get(id: string, token?: string) { const job = jobs.get(id); return job && (!token || token === job.accessToken) ? job : undefined; },
  authorize(id: string, token?: string) { const job = jobs.get(id); return Boolean(job && token && token === job.accessToken); },
  subscribe(id: string, listener: (event: JobEvent) => void) { events.on(id, listener); return () => events.off(id, listener); },
  retry(id: string, token?: string) {
    const job = jobs.get(id);
    if (!job || token !== job.accessToken || !job.retryable || job.attempts >= 3) return undefined;
    job.attempts += 1; job.errorCode = undefined; job.errorMessage = undefined; job.retryable = true; setState(job, "queued", 0, "إعادة المحاولة"); void runDownload(job); return job;
  },
  cancel(id: string, token?: string) {
    const job = jobs.get(id);
    if (!job || token !== job.accessToken || terminal.has(job.status)) return undefined;
    processes.get(id)?.kill("SIGTERM");
    void rm(path.join(ROOT, id), { recursive: true, force: true });
    job.status = "cancelled"; job.stage = "تم إلغاء المهمة"; const safe = safeError("CANCELLED"); job.errorCode = safe.errorCode; job.errorMessage = safe.errorMessage; job.retryable = true; job.updatedAt = new Date().toISOString(); emit(job); return job;
  },
};
