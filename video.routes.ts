import { Router } from "express";
import { z } from "zod";
import { AdapterRegistry } from "../adapters/registry.js";
import { validateVideoUrl } from "../middleware/validate-url.js";
import { jobService } from "../services/job.service.js";
import { safeError } from "../services/error-mapper.service.js";

const router = Router();
const registry = new AdapterRegistry();
const downloadSchema = z.object({ url: z.string().url(), formatId: z.string().optional() });
const token = (req: { query: Record<string, unknown>; body?: unknown }) => String(req.query.token ?? ((req.body as { token?: unknown } | undefined)?.token ?? ""));

router.post("/inspect", validateVideoUrl, async (_req, res) => {
  try {
    const url = res.locals.videoUrl as URL;
    const adapter = registry.resolve(url);
    res.json(await adapter.inspect(url));
  } catch {
    res.status(400).json(safeError("UNSUPPORTED_PROVIDER"));
  }
});

router.post("/downloads", validateVideoUrl, async (req, res) => {
  try {
    const input = downloadSchema.parse(req.body);
    registry.resolve(new URL(input.url));
    res.status(202).json(jobService.create(input.url, input.formatId));
  } catch {
    res.status(400).json(safeError("INVALID_URL"));
  }
});

router.get("/downloads/:id", (req, res) => {
  const job = jobService.get(req.params.id, token(req));
  return job ? res.json(job) : res.status(404).json(safeError("INVALID_URL"));
});

router.get("/downloads/:id/events", (req, res) => {
  const accessToken = token(req);
  const job = jobService.get(req.params.id, accessToken);
  if (!job || !jobService.authorize(req.params.id, accessToken)) return res.status(404).json(safeError("INVALID_URL"));
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const send = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  send({ type: "connected", jobId: job.id, status: job.status, progress: job.progress, stage: job.stage });
  const unsubscribe = jobService.subscribe(job.id, send);
  const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 20_000);
  req.on("close", () => { clearInterval(keepAlive); unsubscribe(); });
});

router.post("/downloads/:id/retry", (req, res) => {
  const job = jobService.retry(req.params.id, token(req));
  return job ? res.status(202).json(job) : res.status(409).json(safeError("INTERNAL_ERROR"));
});

router.delete("/downloads/:id", (req, res) => {
  const job = jobService.cancel(req.params.id, token(req));
  return job ? res.json(job) : res.status(409).json(safeError("CANCELLED"));
});

router.get("/downloads/:id/file", (req, res) => {
  const job = jobService.get(req.params.id, token(req));
  if (!job || !jobService.authorize(req.params.id, token(req))) return res.status(404).json(safeError("INVALID_URL"));
  if (job.status !== "completed" || !job.outputPath) return res.status(409).json({ errorCode: "NOT_READY", errorMessage: "الملف غير جاهز أو انتهت صلاحيته." });
  res.download(job.outputPath, job.fileName ?? "download.bin");
});

export default router;
