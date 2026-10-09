import { NextRequest } from "next/server";
import { ok, err, paginate } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { getJplRows } from "@/lib/diklat/jpl";
import { prisma } from "@/lib/prisma";
import { logServerError, safeErrorMessage } from "@/lib/logger";

/**
 * GET /api/diklat/history?year=YYYY[&roomId=&search=&page=&perPage=]
 *
 * Staff training recap: ONE row per staff, with the count of qualifying
 * activities, total JPL for the selected year, progress, and fulfilment status.
 * Reuses `getJplRows` (the single JPL aggregation) so it matches the dashboard.
 * Requires `diklat.training.read`.
 */
export async function GET(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_READ);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const url = new URL(req.url);
  const yearRaw = url.searchParams.get("year");
  const year = Number(yearRaw) || new Date().getFullYear();
  const roomId = url.searchParams.get("roomId")?.trim() || null;
  const search = url.searchParams.get("search")?.trim() || null;
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const perPage = Math.min(100, Number(url.searchParams.get("perPage")) || 25);

  try {
    const rows = await getJplRows({ year, roomId, search });
    const total = rows.length;
    const start = (page - 1) * perPage;
    const data = rows.slice(start, start + perPage);
    return ok(paginate(data, total, { page, perPage, sortOrder: "asc" }));
  } catch (e) {
    logServerError("diklat.history", e);
    return err("LOAD_FAILED", safeErrorMessage("LOAD_FAILED"), 500);
  }
}

/** Shared: lightweight staff name lookup (used by the detail route). */
export async function findStaffBasic(staffId: string) {
  return prisma.staff.findUnique({
    where: { id: staffId },
    select: { id: true, name: true, nip: true, profession: true, room: { select: { name: true } } },
  });
}
