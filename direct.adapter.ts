import type { VideoAdapter, VideoMetadata } from "../types/video.js";

export class DirectFileAdapter implements VideoAdapter {
  readonly name = "direct" as const;
  private readonly allowedExtensions = new Set([".mp4", ".webm", ".mp3", ".m4a"]);

  canHandle(url: URL): boolean {
    return this.allowedExtensions.has(url.pathname.toLowerCase().slice(url.pathname.lastIndexOf(".")));
  }

  async inspect(url: URL): Promise<VideoMetadata> {
    const ext = url.pathname.toLowerCase().slice(url.pathname.lastIndexOf("."));
    const mimeType = ext === ".mp3" ? "audio/mpeg" : ext === ".m4a" ? "audio/mp4" : `video/${ext.slice(1)}`;
    return {
      provider: this.name, providerVideoId: url.toString(), title: url.pathname.split("/").pop() || "direct-file",
      formats: [
        { id: "original", container: ext.slice(1) as "mp4" | "webm" | "mp3" | "m4a", quality: "original", mimeType },
        ...(mimeType.startsWith("video/") ? [
          { id: "mp4-1080", container: "mp4" as const, quality: "1080p", mimeType: "video/mp4" },
          { id: "mp4-720", container: "mp4" as const, quality: "720p", mimeType: "video/mp4" },
          { id: "mp4-480", container: "mp4" as const, quality: "480p", mimeType: "video/mp4" },
          { id: "webm-1080", container: "webm" as const, quality: "1080p", mimeType: "video/webm" },
          { id: "webm-720", container: "webm" as const, quality: "720p", mimeType: "video/webm" },
          { id: "mp3-320", container: "mp3" as const, quality: "320kbps", mimeType: "audio/mpeg" },
          { id: "mp3-192", container: "mp3" as const, quality: "192kbps", mimeType: "audio/mpeg" },
          { id: "m4a-256", container: "m4a" as const, quality: "256kbps", mimeType: "audio/mp4" },
          { id: "m4a-128", container: "m4a" as const, quality: "128kbps", mimeType: "audio/mp4" },
        ] : [])
      ]
    };
  }

  async createDownloadSource(metadata: VideoMetadata, formatId: string) {
    if (formatId !== "original") throw new Error("Format conversion requires the FFmpeg/yt-dlp worker; only original is enabled in this boilerplate");
    return { url: metadata.providerVideoId, mimeType: metadata.formats[0].mimeType };
  }
}
