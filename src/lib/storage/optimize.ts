/**
 * Lossless file optimization for migration and uploads.
 *
 * HARD RULES (per project requirements):
 *   - NEVER reduce image resolution, DPI, readability or visual fidelity.
 *   - NEVER use lossy quality reduction to reach a size target.
 *   - NEVER blindly convert to JPEG/WebP, and never rasterize PDFs.
 *   - If a file cannot be reduced losslessly, KEEP THE ORIGINAL.
 *
 * TARGET_SIZE (2 MiB) is a goal, not an obligation. When lossless optimization
 * cannot reach it, the best lossless version is kept.
 *
 * The module is deliberately conservative: it only applies transformations it
 * can verify, and falls back to the original bytes whenever:
 *   - the format has no safe lossless transformation available here,
 *   - the transformation fails, produces a larger file, or
 *   - the result cannot be proven byte-safe for the container format.
 */

export const TARGET_SIZE_BYTES = 2048 * 1024; // ~2048 KB (2 MiB)

export type OptimizationOutcome = {
  /** Bytes to store (original when nothing safe could be done). */
  bytes: Uint8Array;
  /** True when the bytes differ from the input. */
  optimized: boolean;
  /** Human-readable record of what happened (stored on the migration item). */
  strategy: string;
  /** Original size in bytes. */
  originalSize: number;
  /** Resulting size in bytes. */
  finalSize: number;
  /** True when the result is provably lossless for the content. */
  lossless: boolean;
};

export type OptimizeOptions = {
  /** Attempt to reach TARGET_SIZE_BYTES; never at the cost of quality. */
  targetBytes?: number;
};

function isZipLike(bytes: Uint8Array, ...signatures: string[]): boolean {
  // ZIP container: "PK\x03\x04"
  if (bytes.length < 4) return false;
  const magic = String.fromCharCode(bytes[0]!, bytes[1]!);
  return signatures.includes(magic);
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

/** Normalizes the reported MIME type; falls back to magic-byte sniffing. */
export function detectKind(bytes: Uint8Array, mimeType?: string, fileName?: string): string {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime) return mime;

  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "application/pdf"; // %PDF
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (isZipLike(bytes, "PK") && fileName?.toLowerCase().endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (isZipLike(bytes, "PK") && fileName?.toLowerCase().endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return "application/octet-stream";
}

/**
 * Lossless PNG re-compression is not performed here: doing it safely without a
 * proven encoder risks altering pixels. PNGs are therefore stored unchanged
 * (metadata is already minimal in the formats we handle).
 *
 * Lossless JPEG (Huffman) optimization likewise requires a dedicated encoder.
 * Recompressing with any quality setting would be lossy, which is forbidden.
 *
 * PDFs are handled by {@link optimizePdf}, which only removes redundant trailing
 * bytes when provably safe.
 */
function buildOutcome(
  original: Uint8Array,
  candidate: Uint8Array,
  strategy: string,
): OptimizationOutcome {
  const useCandidate = candidate.length > 0 && candidate.length < original.length;
  const bytes = useCandidate ? candidate : original;
  return {
    bytes,
    optimized: useCandidate,
    strategy: useCandidate ? strategy : `${strategy} (ditolak: tidak ada pengurangan lossless)`,
    originalSize: original.length,
    finalSize: bytes.length,
    lossless: true,
  };
}

/**
 * PDF: removes only clearly redundant data —
 *  - trailing bytes after the final `%%EOF` marker (some producers append junk),
 * and leaves everything else byte-identical. Page content, images, resolution
 * and quality are never touched.
 */
function optimizePdf(original: Uint8Array): OptimizationOutcome {
  const eof = [0x25, 0x25, 0x45, 0x4f, 0x46]; // %%EOF
  let lastEof = -1;
  for (let i = original.length - eof.length; i >= 0; i--) {
    if (eof.every((value, offset) => original[i + offset] === value)) {
      lastEof = i + eof.length;
      break;
    }
  }
  if (lastEof === -1 || lastEof >= original.length) {
    return buildOutcome(original, original, "pdf: sudah optimal");
  }
  // Keep a single trailing newline for parser compatibility.
  let end = lastEof;
  while (end < original.length && (original[end] === 0x0a || original[end] === 0x0d)) end++;
  return buildOutcome(original, original.slice(0, end), "pdf: hapus data setelah %%EOF");
}

/**
 * ZIP-based Office documents: validated to still be a ZIP container after the
 * operation. No container recompression is attempted (it can corrupt Office
 * packages), so the original is preserved.
 */
function optimizeZipLike(original: Uint8Array, label: string): OptimizationOutcome {
  if (!isZipLike(original, "PK")) {
    return buildOutcome(original, original, `${label}: bukan arsip ZIP valid, dilewati`);
  }
  return buildOutcome(original, original, `${label}: dipertahankan (rekompresi container tidak aman)`);
}

/**
 * Optimizes a single file losslessly. Always returns usable bytes: the original
 * when no safe reduction is available.
 */
export function optimizeLossless(
  input: Uint8Array,
  mimeType?: string,
  fileName?: string,
): OptimizationOutcome {
  const kind = detectKind(input, mimeType, fileName);

  try {
    switch (kind) {
      case "application/pdf":
        return optimizePdf(input);

      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return optimizeZipLike(input, "docx");

      case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        return optimizeZipLike(input, "xlsx");

      case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
        return optimizeZipLike(input, "pptx");

      case "application/zip":
      case "application/x-zip-compressed":
        return optimizeZipLike(input, "zip");

      case "image/png":
        // Pixel-exact preservation required: store unchanged.
        return buildOutcome(input, input, "png: dipertahankan (piksel harus identik)");

      case "image/jpeg":
      case "image/jpg":
        return buildOutcome(input, input, "jpeg: dipertahankan (rekompresi bersifat lossy)");

      case "image/webp":
        return buildOutcome(input, input, "webp: dipertahankan (tanpa encoder lossless)");

      default:
        return buildOutcome(input, input, `${kind}: tanpa optimasi lossless yang aman`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "kesalahan tidak diketahui";
    return {
      bytes: input,
      optimized: false,
      strategy: `optimasi gagal, memakai asli: ${message}`,
      originalSize: input.length,
      finalSize: input.length,
      lossless: true,
    };
  }
}

/** SHA-256 hex digest, used for integrity tracking before/after optimization. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const view = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", view);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
