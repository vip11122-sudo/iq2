import type { RequestHandler } from "express";

const blockedHosts = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
export const validateVideoUrl: RequestHandler = (req, res, next) => {
  try {
    const value = req.body?.url;
    if (typeof value !== "string" || value.length > 2048) return res.status(400).json({ error: "A valid URL is required" });
    const url = new URL(value);
    if (url.protocol !== "https:") return res.status(400).json({ error: "Only HTTPS URLs are accepted" });
    if (blockedHosts.has(url.hostname.toLowerCase()) || /^127\.|^10\.|^192\.168\./.test(url.hostname)) return res.status(400).json({ error: "Private network URLs are not allowed" });
    res.locals.videoUrl = url;
    next();
  } catch { res.status(400).json({ error: "Invalid URL" }); }
};
