export type JobStatus =
  | "queued"
  | "inspecting"
  | "processing"
  | "converting"
  | "uploading"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired"
  | "paused_provider";

export type ErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_PROVIDER"
  | "FORMAT_UNAVAILABLE"
  | "NETWORK_TIMEOUT"
  | "PROVIDER_RATE_LIMITED"
  | "FILE_TOO_LARGE"
  | "STORAGE_ERROR"
  | "CANCELLED"
  | "INTERNAL_ERROR";

export interface JobEvent {
  type: "status" | "error" | "connected";
  jobId: string;
  status: JobStatus;
  progress: number;
  stage: string;
  errorCode?: ErrorCode;
  errorMessage?: string;
  retryable?: boolean;
  timestamp: string;
}
