import { DirectFileAdapter } from "./direct.adapter.js";
import { VimeoAdapter } from "./vimeo.adapter.js";
import { YouTubeAdapter } from "./youtube.adapter.js";
import type { VideoAdapter } from "../types/video.js";

export class AdapterRegistry {
  constructor(private readonly adapters: VideoAdapter[] = [new DirectFileAdapter(), new YouTubeAdapter(), new VimeoAdapter()]) {}
  resolve(url: URL): VideoAdapter {
    const adapter = this.adapters.find((candidate) => candidate.canHandle(url));
    if (!adapter) throw new Error("Unsupported video provider");
    return adapter;
  }
}
