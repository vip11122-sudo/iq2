import type { VideoAdapter, VideoMetadata } from "../types/video.js";

export class VimeoAdapter implements VideoAdapter {
  readonly name = "vimeo" as const;
  canHandle(url: URL): boolean { return ["vimeo.com", "www.vimeo.com"].includes(url.hostname.toLowerCase()); }
  async inspect(url: URL): Promise<VideoMetadata> {
    return { provider: this.name, providerVideoId: url.pathname.split("/").filter(Boolean).pop() || "unknown", title: "Metadata pending approved provider", formats: [] };
  }
  async createDownloadSource(): Promise<never> {
    throw new Error("Vimeo downloading requires an approved API/provider and is disabled in this boilerplate");
  }
}
