import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, err } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { removeObject } from "@/lib/storage";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.KOMITE_DOCUMENT_DELETE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return err("NOT_FOUND", "Dokumen tidak ditemukan", 404);

  try {
    if (doc.storageKey) {
      await removeObject(doc.storageKey);
    }
    await prisma.document.delete({ where: { id } });
    return ok({ deleted: true });
  } catch {
    return err("DELETE_FAILED", "Gagal menghapus dokumen", 500);
  }
}
