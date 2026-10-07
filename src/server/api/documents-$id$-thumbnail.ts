import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { err } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { readThumbnail } from "@/lib/storage";
import { contentTypeForName } from "@/lib/file-type";

/**
 * Lightweight thumbnail endpoint for list/avatar rendering.
 *
 * Returns a small (≈256px) image so the Staff table never downloads the
 * multi-megabyte original. The full-size image is still served by
 * `/api/documents/:id/download` for the photo preview (lightbox).
 *
 * Access is gated by the same document-read permission as the download route,
 * and responses are cached for a day so repeat renders do not re-fetch.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.KOMITE_DOCUMENT_READ);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const sizeParam = Number(new URL(req.url).searchParams.get("size"));
  const size = Number.isFinite(sizeParam) && sizeParam >= 32 && sizeParam <= 512 ? Math.round(sizeParam) : 256;

  const doc = await prisma.document.findUnique({
    where: { id },
    select: { storageKey: true, mimeType: true, filename: true },
  });
  if (!doc) return err("NOT_FOUND", "Dokumen tidak ditemukan", 404);
  if (!doc.storageKey) return err("NO_FILE", "Berkas belum tersedia", 404);
  if (doc.mimeType && !doc.mimeType.startsWith("image/")) {
    return err("NOT_IMAGE", "Dokumen bukan gambar", 415);
  }

  let thumb: Awaited<ReturnType<typeof readThumbnail>> = null;
  try {
    thumb = await readThumbnail(doc.storageKey, size);
  } catch (e) {
    return err("STORAGE_ERROR", e instanceof Error ? e.message : "Gagal membaca penyimpanan", 502);
  }
  if (!thumb) return err("FILE_MISSING", "Berkas tidak ditemukan di penyimpanan", 410);

  // Type derived from the stored key/name extension (never the provider value).
  const mime = contentTypeForName(doc.storageKey || doc.filename || "");
  return new Response(thumb.body, {
    headers: {
      "Content-Type": mime.startsWith("image/") ? mime : "image/jpeg",
      ...(thumb.contentLength ? { "Content-Length": String(thumb.contentLength) } : {}),
      "X-Content-Type-Options": "nosniff",
      // Thumbnails are cheap and stable per file version — cache aggressively
      // for the session. `private` keeps them out of shared caches.
      "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
