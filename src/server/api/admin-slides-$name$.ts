import { NextRequest } from "next/server";
import * as fs from "fs";
import { ok, err } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { logAudit, clientIp } from "@/lib/audit";
import { resolveSlidePath, listSlides, slideSrc } from "@/lib/slides";
import { logServerError } from "@/lib/logger";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { authorized, user } = await checkPermission(PERMISSIONS.ADMIN_SETTINGS);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { name } = await params;
  // Resolve through the strict allow-list + containment check; a traversal
  // attempt resolves to null and is reported as "not found".
  const filePath = resolveSlidePath(name);
  if (!filePath || !fs.existsSync(filePath)) {
    return err("NOT_FOUND", "Slide tidak ditemukan", 404);
  }

  try {
    fs.unlinkSync(filePath);
    await logAudit({
      userId: user.id,
      module: "admin",
      resource: "slide",
      resourceId: slideSrc(name),
      action: "DELETED",
      ipAddress: clientIp(req),
    });
    return ok({ slides: listSlides() });
  } catch (e) {
    logServerError("slides.delete", e);
    return err("DELETE_FAILED", "Gagal menghapus slide", 500);
  }
}
