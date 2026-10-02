import type { VideoAdapter, VideoMetadata } from "../types/video.js";

/**
 * Metadata-only placeholder. Implement with an approved/official provider before production.
 * Never bypass DRM, login barriers, or platform restrictions.
 */
export class YouTubeAdapter implements VideoAdapter {
  readonly name = "youtube" as const;
  canHandle(url: URL): boolean {
    return ["youtube.com", "www.youtube.com", "youtu.be"].includes(url.hostname.toLowerCase());
  }
  async inspect(url: URL): Promise<VideoMetadata> {
    const id = url.hostname === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v") || "unknown";
    return { provider: this.name, providerVideoId: id, title: "Metadata pending approved provider", formats: [] };
  }
  async createDownloadSource(): Promise<never> {
    throw new Error("YouTube downloading is disabled in this boilerplate until an approved provider is configured");
  }
}
