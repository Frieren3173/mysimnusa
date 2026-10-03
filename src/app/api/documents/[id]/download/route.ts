import { NextRequest } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "@/lib/prisma";
import { err } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";

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

  // Local file upload
  if (doc.storageKey) {
    const filePath = path.join(process.cwd(), "storage", doc.storageKey);
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      const downloadName = `${doc.staff.name.replace(/[^\w.-]+/g, "_")}_${doc.documentType.code}${path.extname(filePath)}`;
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": doc.mimeType ?? "application/octet-stream",
          "Content-Length": String(buffer.byteLength),
          "Content-Disposition": `inline; filename="${downloadName}"`,
          "Cache-Control": "private, max-age=0, must-revalidate",
        },
      });
    }
    return err("FILE_MISSING", "Berkas tidak ditemukan di penyimpanan", 410);
  }

  // Legacy Google Drive link (Fase 5: sinkronisasi binary)
  if (doc.legacyDriveUrl) {
    return Response.redirect(doc.legacyDriveUrl, 302);
  }

  return err("NO_FILE", "Berkas belum tersedia (menunggu unggah atau sinkronisasi Drive)", 404);
}
