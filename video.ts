export type ProviderName = "direct" | "youtube" | "vimeo";
export type JobStatus = "queued" | "processing" | "completed" | "failed";

export interface VideoFormat {
  id: string;
  container: "mp4" | "webm" | "mp3" | "m4a";
  quality: string;
  mimeType: string;
  sizeBytes?: number;
}

export interface VideoMetadata {
  provider: ProviderName;
  providerVideoId: string;
  title: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
  formats: VideoFormat[];
}

export interface VideoAdapter {
  readonly name: ProviderName;
  canHandle(url: URL): boolean;
  inspect(url: URL): Promise<VideoMetadata>;
  createDownloadSource(metadata: VideoMetadata, formatId: string): Promise<{ url: string; mimeType: string }>;
}
