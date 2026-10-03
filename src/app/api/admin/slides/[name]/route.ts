import { NextRequest } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { ok, err } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { logAudit, clientIp } from "@/lib/audit";
import { SLIDES_DIR, isSafeSlideName, listSlides, slideSrc } from "@/lib/slides";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { authorized, user } = await checkPermission(PERMISSIONS.ADMIN_SETTINGS);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { name } = await params;
  const decoded = decodeURIComponent(name);
  if (!isSafeSlideName(decoded)) return err("NOT_FOUND", "Slide tidak ditemukan", 404);

  const filePath = path.join(SLIDES_DIR, decoded);
  if (!fs.existsSync(filePath)) return err("NOT_FOUND", "Slide tidak ditemukan", 404);

  try {
    fs.unlinkSync(filePath);
    await logAudit({
      userId: user.id,
      module: "admin",
      resource: "slide",
      resourceId: slideSrc(decoded),
      action: "DELETED",
      ipAddress: clientIp(req),
    });
    return ok({ slides: listSlides() });
  } catch (e) {
    return err("DELETE_FAILED", e instanceof Error ? e.message : "Gagal menghapus slide", 500);
  }
}
