/**
 * Server-side file-type determination for uploads and downloads.
 *
 * The browser-supplied `File.type` is a hint at best — a client can claim any
 * MIME type for any bytes. This module NEVER trusts it:
 *
 *   1. The extension is the primary signal, mapped through a fixed
 *      extension→MIME table owned by the server.
 *   2. If the client MIME is present and clearly contradicts that extension,
 *      the upload is rejected.
 *   3. Magic bytes are verified against the bytes themselves.
 *
 * The same helpers are used when *serving* files: the `Content-Type` is derived
 * from the stored key's extension (so legacy rows saved with a wrong type are
 * still served safely), and only genuinely inline-safe types (PDF, images) are
 * allowed `inline`; everything else is forced to `attachment`.
 */

/** Extension (lowercase, with dot) → canonical MIME type. */
export const EXT_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** MIME → canonical extension (used when only a type is known). */
export const MIME_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(EXT_MIME).map(([ext, mime]) => [mime, ext]),
);

/**
 * MIME types the server considers equivalent for a given family — used to allow
 * legitimate browser variance without opening the door to contradictions.
 */
const MIME_ALIASES: Record<string, string[]> = {
  "image/jpeg": ["image/jpeg", "image/jpg", "image/pjpeg"],
  "image/png": ["image/png"],
  "image/webp": ["image/webp"],
  "application/pdf": ["application/pdf"],
  "application/msword": ["application/msword", "application/x-msword"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
  ],
  "application/vnd.ms-excel": ["application/vnd.ms-excel", "application/x-msexcel"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
  ],
  "application/octet-stream": ["application/octet-stream"],
};

export function extname(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot).toLowerCase();
}

/** True when the extension is one the server supports. */
export function isKnownExtension(ext: string): boolean {
  return Object.prototype.hasOwnProperty.call(EXT_MIME, ext.toLowerCase());
}

/** Human-friendly label for an error message. */
export function describeExtensions(exts: string[]): string {
  return exts.join(", ");
}

// ─── Magic-byte signatures ───────────────────────────────────

export type SignatureCheck = (bytes: Uint8Array) => boolean;

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (bytes[i] !== sig[i]) return false;
  return true;
}

const PDF_SIG = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const JPEG_SIG = [0xff, 0xd8, 0xff];
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const OLE_SIG = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // DOC/XLS (OLE2)
const ZIP_SIG = [0x50, 0x4b]; // "PK" — DOCX/XLSX (ZIP container)

function isWebp(bytes: Uint8Array): boolean {
  // RIFF....WEBP
  if (bytes.length < 12) return false;
  return (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  );
}

/** Magic-byte checker per canonical MIME type. */
const MAGIC_CHECK: Record<string, SignatureCheck> = {
  "application/pdf": (b) => startsWith(b, PDF_SIG),
  "image/jpeg": (b) => startsWith(b, JPEG_SIG),
  "image/png": (b) => startsWith(b, PNG_SIG),
  "image/webp": isWebp,
  "application/msword": (b) => startsWith(b, OLE_SIG),
  "application/vnd.ms-excel": (b) => startsWith(b, OLE_SIG),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (b) => startsWith(b, ZIP_SIG),
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (b) => startsWith(b, ZIP_SIG),
};

/** Returns true when `bytes` match the magic signature for `mime`. */
export function matchesMagicBytes(mime: string, bytes: Uint8Array): boolean {
  const check = MAGIC_CHECK[mime];
  if (!check) return false;
  return check(bytes);
}

/** Types that may be rendered inline; everything else is forced to download. */
const INLINE_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export function isInlineSafe(mime: string): boolean {
  return INLINE_MIME.has(mime);
}

/** Content-Type for a stored object, derived from its key/name extension. */
export function contentTypeForName(name: string): string {
  return EXT_MIME[extname(name)] ?? "application/octet-stream";
}

// ─── Filename sanitisation for Content-Disposition ───────────

/**
 * Builds a safe `Content-Disposition` value.
 *
 * ASCII-only, path-stripped `filename="..."` for old clients, plus an RFC 5987
 * `filename*=UTF-8''...` when the original name contains non-ASCII characters.
 */
export function contentDisposition(
  disposition: "inline" | "attachment",
  filename: string,
): string {
  // Strip any directory components and control characters.
  const base = filename.replace(/^.*[\\/]/, "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  const safe = base || "file";

  const asciiFallback = safe.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");

  const hasNonAscii = /[^\x00-\x7f]/.test(safe);
  if (!hasNonAscii) {
    return `${disposition}; filename="${asciiFallback}"`;
  }
  // RFC 5987 percent-encoding (encodeURIComponent leaves a few safe chars).
  const encoded = encodeURIComponent(safe).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

// ─── Combined validation ─────────────────────────────────────

export type FileTypeVerdict =
  | { ok: true; mime: string; ext: string }
  | { ok: false; code: string; message: string };

/**
 * Validates an uploaded file against the allow-list.
 *
 * @param fileName       original file name (extension is authoritative)
 * @param clientMimeType the browser-supplied type (treated as a hint only)
 * @param bytes          the actual content (for magic-byte verification)
 * @param allowedExts    extensions the caller permits
 */
export function validateUpload(
  fileName: string,
  clientMimeType: string,
  bytes: Uint8Array,
  allowedExts: string[],
): FileTypeVerdict {
  const ext = extname(fileName);
  if (!ext || !allowedExts.includes(ext)) {
    return {
      ok: false,
      code: "INVALID_TYPE",
      message: `Format file tidak didukung (${ext || "tanpa ekstensi"})`,
    };
  }

  const mime = EXT_MIME[ext];
  if (!mime) {
    return { ok: false, code: "INVALID_TYPE", message: `Format file tidak didukung (${ext})` };
  }

  // Reject when the client MIME clearly contradicts the extension.
  const claimed = (clientMimeType || "").trim().toLowerCase();
  if (claimed && claimed !== "application/octet-stream") {
    const acceptable = MIME_ALIASES[mime] ?? [mime];
    if (!acceptable.includes(claimed)) {
      return {
        ok: false,
        code: "MIME_MISMATCH",
        message: "Tipe berkas tidak sesuai dengan ekstensinya",
      };
    }
  }

  if (!matchesMagicBytes(mime, bytes)) {
    return {
      ok: false,
      code: "INVALID_CONTENT",
      message: "Isi berkas tidak cocok dengan tipe yang dinyatakan",
    };
  }

  return { ok: true, mime, ext };
}
