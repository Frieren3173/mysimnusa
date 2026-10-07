/**
 * Minimal server-side logger + safe error helpers.
 *
 * API handlers must never return a raw exception message to the client: it can
 * leak database internals, file paths or upstream URLs. Instead they log the
 * real error server-side and return a generic Indonesian message while keeping
 * the existing error code and HTTP status.
 *
 * `logServerError` never prints request bodies, tokens or credentials — only the
 * scope tag and the error's name/message/stack.
 */

function scrub(value: string): string {
  // Best-effort removal of anything that looks like a credential or URL secret.
  return value
    .replace(/([?&](access_token|refresh_token|api_key|key|token|code|client_secret)=)[^&\s]+/gi, "$1***")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***")
    .replace(/postgres(ql)?:\/\/[^\s"']+/gi, "postgres://***");
}

/** Logs an internal error without leaking secrets. Never throws. */
export function logServerError(scope: string, error: unknown): void {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const message = scrub(err.message);
    const stack = err.stack ? scrub(err.stack) : undefined;
    console.error(`[mysimnusa:error] ${scope}: ${message}`, stack ? `\n${stack}` : "");
  } catch {
    // Logging must never break the request path.
  }
}

/** Standard generic message per error code (Indonesian). */
const GENERIC_MESSAGES: Record<string, string> = {
  CREATE_FAILED: "Gagal menyimpan data",
  UPDATE_FAILED: "Gagal memperbarui data",
  DELETE_FAILED: "Gagal menghapus data",
  LIST_FAILED: "Gagal memuat data",
  UPLOAD_FAILED: "Gagal mengunggah berkas",
  STORAGE_ERROR: "Gagal membaca penyimpanan berkas",
  IMPORT_FAILED: "Gagal mengimpor data",
  SCAN_FAILED: "Gagal memindai data",
  WORKFLOW_FAILED: "Gagal memproses perubahan status",
  GENERATE_FAILED: "Gagal membuat berkas",
  DRIVE_LIST_FAILED: "Gagal membaca Google Drive",
};

/**
 * Logs the real error and returns the code's generic message. Keeps the error
 * code and status unchanged so the client contract does not shift.
 */
export function safeErrorMessage(code: string, fallback = "Terjadi kesalahan pada server"): string {
  return GENERIC_MESSAGES[code] ?? fallback;
}
