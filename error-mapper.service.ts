import type { ErrorCode } from "../types/jobs.js";

const messages: Record<ErrorCode, { ar: string; en: string; retryable: boolean }> = {
  INVALID_URL: { ar: "الرابط غير صالح أو غير مدعوم.", en: "The URL is invalid or unsupported.", retryable: false },
  UNSUPPORTED_PROVIDER: { ar: "هذه المنصة غير مدعومة حاليًا.", en: "This provider is not supported yet.", retryable: false },
  FORMAT_UNAVAILABLE: { ar: "الصيغة المطلوبة غير متاحة لهذا الفيديو.", en: "The selected format is unavailable.", retryable: false },
  NETWORK_TIMEOUT: { ar: "انتهت مهلة الاتصال بالمصدر.", en: "The connection timed out.", retryable: true },
  PROVIDER_RATE_LIMITED: { ar: "المصدر مشغول مؤقتًا، وسنحاول لاحقًا.", en: "The source is temporarily busy; we will retry later.", retryable: true },
  FILE_TOO_LARGE: { ar: "حجم الملف يتجاوز الحد المسموح.", en: "The file exceeds the allowed size.", retryable: false },
  STORAGE_ERROR: { ar: "تعذر تجهيز الملف مؤقتًا.", en: "The file could not be prepared temporarily.", retryable: true },
  CANCELLED: { ar: "تم إلغاء المهمة.", en: "The job was cancelled.", retryable: true },
  INTERNAL_ERROR: { ar: "حدث خطأ غير متوقع. حاول مرة أخرى.", en: "An unexpected error occurred. Please try again.", retryable: true },
};

export function safeError(code: ErrorCode) {
  const item = messages[code] ?? messages.INTERNAL_ERROR;
  return { errorCode: code, errorMessage: item.ar, errorMessageEn: item.en, retryable: item.retryable };
}

export function classifyError(error: unknown) {
  const text = error instanceof Error ? error.message.toLowerCase() : "";
  if (text.includes("429") || text.includes("rate")) return "PROVIDER_RATE_LIMITED" as const;
  if (text.includes("timeout")) return "NETWORK_TIMEOUT" as const;
  if (text.includes("format")) return "FORMAT_UNAVAILABLE" as const;
  return "INTERNAL_ERROR" as const;
}
