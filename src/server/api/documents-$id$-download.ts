import { NextRequest } from "next/server";
import * as path from "path";
import { prisma } from "@/lib/prisma";
import { err } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { readObject } from "@/lib/storage";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.KOMITE_DOCUMENT_READ);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id },
    include: { documentType: true, staff: { select: { id: true, name: true } } },
  });
  if (!doc) return err("NOT_FOUND", "Dokumen tidak ditemukan", 404);

  // Object stored in Cloudflare R2 (or local disk during development)
  if (doc.storageKey) {
    let stored: Awaited<ReturnType<typeof readObject>> = null;
    try {
      stored = await readObject(doc.storageKey);
    } catch (e) {
      return err("STORAGE_ERROR", e instanceof Error ? e.message : "Gagal membaca penyimpanan", 502);
    }
    if (!stored) {
      return err("FILE_MISSING", "Berkas tidak ditemukan di penyimpanan", 410);
    }

    const ext = path.extname(doc.storageKey);
    const downloadName = `${doc.staff.name.replace(/[^\w.-]+/g, "_")}_${doc.documentType.code}${ext}`;
    return new Response(stored.body, {
      headers: {
        "Content-Type": stored.contentType ?? doc.mimeType ?? "application/octet-stream",
        ...(stored.contentLength ? { "Content-Length": String(stored.contentLength) } : {}),
        "Content-Disposition": `inline; filename="${downloadName}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  }

  // Legacy Google Drive link (Fase 5: sinkronisasi binary)
  if (doc.legacyDriveUrl) {
    return Response.redirect(doc.legacyDriveUrl, 302);
  }

  return err("NO_FILE", "Berkas belum tersedia (menunggu unggah atau sinkronisasi Drive)", 404);
}
