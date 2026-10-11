import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { ok, err } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { logAudit, clientIp } from "@/lib/audit";
import { validateRegisterRows, MAX_REGISTER_ROWS } from "@/lib/komite/patient-register";
import { logServerError, safeErrorMessage } from "@/lib/logger";

/**
 * Per-room patient register.
 *
 *  GET  ?roomId=            → list the register of a room the actor may read.
 *  POST { roomId, rows }    → import/replace the register of a room.
 *
 * Authorization (enforced server-side, never UI-only):
 *  • upload/manage: ONLY the Kepala Ruang assigned to that room (or superadmin).
 *  • read: Kepala Ruang of the room, superadmin, secretariat (DIKLAT_BORANG).
 * Staff never upload/manage; they only READ their own room's register (through
 * the read path) to select a patient when creating a Borang entry.
 */

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

async function roomScopeForUpload(user: { id: string; isSuperAdmin: () => boolean }) {
  if (user.isSuperAdmin()) return { isSuperAdmin: true, roomIds: [] as string[] };
  const rows = await prisma.roomKepalaRuang.findMany({ where: { userId: user.id }, select: { roomId: true } });
  return { isSuperAdmin: false, roomIds: rows.map((r) => r.roomId) };
}

export async function GET(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.BORANG_LOGBOOK_READ);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const roomId = req.nextUrl.searchParams.get("roomId")?.trim();
  if (!roomId) return err("BAD_REQUEST", "roomId wajib diisi", 400);

  // Read scope: superadmin & secretariat → any room; Kepala Ruang → own rooms;
  // Staff (USER) → only their OWN room.
  const isPrivileged = user.isSuperAdmin() || user.hasRole("DIKLAT_BORANG") || user.hasRole("ADMIN_BORANG");
  if (!isPrivileged) {
    const isKaru = user.hasRole("KEPALA_RUANG");
    if (isKaru) {
      const own = await prisma.roomKepalaRuang.findFirst({ where: { userId: user.id, roomId }, select: { roomId: true } });
      if (!own) return err("FORBIDDEN", "Anda hanya dapat melihat register ruangan Anda.", 403);
    } else {
      // Staff: must be linked to that room via their own staff record.
      if (!user.staff?.roomId || user.staff.roomId !== roomId) {
        return err("FORBIDDEN", "Anda hanya dapat melihat register ruangan Anda.", 403);
      }
    }
  }

  // Optional server-side validation of a single RM against THIS room's register
  // (used by the Staff picker to verify a selection belongs to their room).
  const verifyRm = req.nextUrl.searchParams.get("rm")?.trim();
  if (verifyRm) {
    const found = await prisma.patientRegisterEntry.findUnique({
      where: { roomId_rmNumber: { roomId, rmNumber: verifyRm } },
      select: { id: true, no: true, rmNumber: true, patientName: true, diagnosis: true },
    });
    if (!found) return err("RM_NOT_FOUND", "Nomor RM tidak terdaftar di register ruangan ini.", 404);
    return ok({ entry: { ...found, patientName: undefined } }); // never echo the patient name here
  }

  const entries = await prisma.patientRegisterEntry.findMany({
    where: { roomId },
    orderBy: [{ no: "asc" }, { patientName: "asc" }],
    select: { id: true, no: true, patientName: true, rmNumber: true, diagnosis: true, createdAt: true },
    take: MAX_REGISTER_ROWS,
  });
  return ok({ entries });
}

export async function POST(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.BORANG_KARU_REVIEW);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Hanya Kepala Ruang yang dapat mengelola register pasien", 403);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err("INVALID_FORM", "Request harus multipart/form-data", 400);
  }

  const roomId = String(form.get("roomId") ?? "").trim();
  if (!roomId) return err("BAD_REQUEST", "roomId wajib diisi", 400);

  // Room ownership: the actor must be the Kepala Ruang of THIS room (or superadmin).
  const scope = await roomScopeForUpload(user);
  if (!scope.isSuperAdmin && !scope.roomIds.includes(roomId)) {
    return err("FORBIDDEN", "Anda hanya dapat mengelola register ruangan Anda.", 403);
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return err("NO_FILE", "Berkas register wajib diunggah", 400);
  if (file.size > MAX_BYTES) return err("FILE_TOO_LARGE", "Ukuran berkas melebihi 5 MB", 413);
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return err("BAD_FORMAT", "Format harus .xlsx, .xls, atau .csv", 422);

  let rowsRaw: Record<string, unknown>[];
  let header: string[];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
    if (aoa.length === 0) return err("EMPTY_FILE", "Berkas kosong", 422);
    header = (aoa[0] as unknown[]).map((h) => String(h ?? ""));
    rowsRaw = aoa.slice(1).map((r) => {
      const arr = r as unknown[];
      return { no: arr[0], patientName: arr[1], rmNumber: arr[2], diagnosis: arr[3] };
    });
    if (rowsRaw.length > MAX_REGISTER_ROWS) return err("TOO_MANY_ROWS", `Maksimal ${MAX_REGISTER_ROWS} baris`, 422);
  } catch {
    return err("PARSE_FAILED", "Gagal membaca berkas. Pastikan format sesuai template.", 422);
  }

  let parsed;
  try {
    parsed = validateRegisterRows(rowsRaw, header);
  } catch (e) {
    return err("VALIDATION_ERROR", (e as Error).message, 422);
  }

  // All-or-nothing: reject the whole upload if ANY row is invalid (no partial import).
  if (parsed.errors.length > 0) {
    return err("IMPORT_INVALID", `${parsed.errors.length} baris tidak valid. Tidak ada data yang diimpor.`, 422, {
      rows: parsed.errors.slice(0, 50).map((e) => `${e.row}: ${e.message}`),
    });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Safe update policy: ADD-OR-UPDATE by (roomId, rmNumber). Existing rows for
      // the room that are NOT in the file are preserved (no silent mass delete).
      let created = 0;
      let updated = 0;
      for (const row of parsed.valid) {
        const existing = await tx.patientRegisterEntry.findUnique({
          where: { roomId_rmNumber: { roomId, rmNumber: row.rmNumber } },
          select: { id: true },
        });
        if (existing) {
          await tx.patientRegisterEntry.update({
            where: { id: existing.id },
            data: { no: row.no, patientName: row.patientName, diagnosis: row.diagnosis },
          });
          updated++;
        } else {
          await tx.patientRegisterEntry.create({
            data: { roomId, no: row.no, patientName: row.patientName, rmNumber: row.rmNumber, diagnosis: row.diagnosis, createdById: user.id },
          });
          created++;
        }
      }
      return { created, updated };
    });

    await logAudit({
      userId: user.id,
      module: "borang",
      resource: "patient_register",
      resourceId: roomId,
      action: "IMPORTED",
      after: { roomId, created: result.created, updated: result.updated },
      ipAddress: clientIp(req),
    });

    return ok({ ...result, total: parsed.valid.length });
  } catch (e) {
    logServerError("borang.patient-register.import", e);
    return err("IMPORT_FAILED", safeErrorMessage("IMPORT_FAILED"), 500);
  }
}
