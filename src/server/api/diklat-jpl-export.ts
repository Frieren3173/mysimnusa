import { NextRequest, NextResponse } from "next/server";
import { err } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { getJplRows } from "@/lib/diklat/jpl";
import { buildXlsxBuffer } from "@/lib/xlsx-export";
import { contentDisposition } from "@/lib/file-type";
import { logServerError, safeErrorMessage } from "@/lib/logger";

/**
 * GET /api/diklat/jpl/export?year=YYYY[&roomId=...]
 *
 * Downloads the annual JPL (Jam Pelajaran) recap as .xlsx. Reads the SAME
 * `getJplRows` service as the dashboard so numbers are identical, and applies
 * the SAME year/room filters. Requires `diklat.training.read`.
 */
export async function GET(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_READ);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const url = new URL(req.url);
  const yearRaw = url.searchParams.get("year");
  const year = Number(yearRaw);
  if (!yearRaw || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return err("BAD_REQUEST", "Parameter year tidak valid (YYYY)", 400);
  }
  const roomId = url.searchParams.get("roomId")?.trim() || null;
  const search = url.searchParams.get("search")?.trim() || null;

  try {
    const [rows, room] = await Promise.all([
      getJplRows({ year, roomId, search }),
      roomId
        ? import("@/lib/prisma").then(({ prisma }) =>
            prisma.room.findUnique({ where: { id: roomId }, select: { name: true } }),
          )
        : Promise.resolve(null),
    ]);

    const bodyRows = rows.map((r, i) => [
      i + 1,
      r.nip ?? "",
      r.staffName,
      r.roomName ?? "",
      year,
      r.targetJpl,
      r.totalJpl,
      r.remainingJpl,
      `${r.progressPct}%`,
      r.met ? "Memenuhi" : "Belum Memenuhi",
    ]);

    const buf = buildXlsxBuffer([
      {
        name: `JPL ${year}`,
        headers: [
          "No",
          "NIP",
          "Nama Staf",
          "Ruangan",
          "Tahun",
          "Target JPL",
          "Total JPL",
          "Sisa JPL",
          "Progres",
          "Status",
        ],
        rows: bodyRows,
      },
    ]);

    const safeRoom = room?.name ? `-${room.name.replace(/[^\w.-]+/g, "_")}` : "";
    const filename = `Rekap-JPL-${year}${safeRoom}.xlsx`;
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDisposition("attachment", filename),
        "X-Content-Type-Options": "nosniff",
        "Content-Length": String(buf.byteLength),
      },
    });
  } catch (e) {
    logServerError("diklat.jpl.export", e);
    return err("EXPORT_FAILED", safeErrorMessage("EXPORT_FAILED"), 500);
  }
}
