import { NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { getStaffHistory } from "@/lib/diklat/history";
import { logServerError, safeErrorMessage } from "@/lib/logger";

/**
 * GET /api/diklat/history/:staffId[?year=YYYY]
 *
 * One staff member's training history (see `getStaffHistory`). Requires
 * `diklat.training.read`, enforced server-side.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_READ);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { staffId } = await params;
  const url = new URL(req.url);
  const yearRaw = url.searchParams.get("year");
  const year = yearRaw ? Number(yearRaw) : null;

  try {
    const history = await getStaffHistory(staffId, year && Number.isInteger(year) ? year : null);
    if (!history) return err("NOT_FOUND", "Staf tidak ditemukan", 404);
    return ok(history);
  } catch (e) {
    logServerError("diklat.history.detail", e);
    return err("LOAD_FAILED", safeErrorMessage("LOAD_FAILED"), 500);
  }
}
