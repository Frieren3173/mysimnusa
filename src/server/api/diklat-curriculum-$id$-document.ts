import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { ok, err } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { putObject, readObject } from "@/lib/storage";
import { validateUpload, EXT_MIME, contentTypeForName, isInlineSafe, contentDisposition } from "@/lib/file-type";
import { logAudit, clientIp } from "@/lib/audit";
import { logServerError, safeErrorMessage } from "@/lib/logger";

/**
 * Curriculum program document.
 *
 * POST /api/diklat/curriculum/:id/document  — upload/replace the curriculum doc
 * GET  /api/diklat/curriculum/:id/document  — download the stored document
 *
 * Uses the EXISTING storage provider (no new provider). Validation mirrors the
 * Komite document upload: extension allow-list + magic-byte check + 15 MB cap.
 * Upload requires `diklat.training.update`; download requires `diklat.training.read`.
 */
const MAX_SIZE = 15 * 1024 * 1024; // 15 MB
// Curriculum docs are documents: pdf/office/images.
const ALLOWED_EXT = Object.keys(EXT_MIME);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_UPDATE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const program = await prisma.curriculumProgram.findUnique({ where: { id } });
  if (!program) return err("NOT_FOUND", "Program tidak ditemukan", 404);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err("INVALID_FORM", "Request harus multipart/form-data", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return err("NO_FILE", "File belum dipilih", 422);
  if (file.size > MAX_SIZE) return err("FILE_TOO_LARGE", "Ukuran file maksimal 15 MB", 413);

  const bytes = await file.arrayBuffer();
  const verdict = validateUpload(file.name, file.type, new Uint8Array(bytes), ALLOWED_EXT);
  if (!verdict.ok) return err(verdict.code, verdict.message, 415);

  try {
    const checksum = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
    const stored = await putObject({
      scope: "diklat",
      ownerId: program.id,
      category: "kurikulum",
      fileName: file.name,
      contentType: verdict.mime,
      body: bytes,
    });

    const updated = await prisma.curriculumProgram.update({
      where: { id },
      data: {
        documentStorageKey: stored.storageKey,
        documentProvider: stored.provider,
        documentName: file.name,
        documentMimeType: verdict.mime,
        documentSize: stored.bytes,
      },
    });

    await logAudit({
      userId: user.id,
      module: "diklat",
      resource: "curriculum_program",
      resourceId: id,
      action: "UPDATED",
      after: { document: file.name, checksum, program: program.name },
      ipAddress: clientIp(req),
    });

    return ok({ document: { name: updated.documentName, size: updated.documentSize } });
  } catch (e) {
    logServerError("diklat.curriculum.document.upload", e);
    return err("UPLOAD_FAILED", safeErrorMessage("UPLOAD_FAILED"), 500);
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_READ);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const program = await prisma.curriculumProgram.findUnique({
    where: { id },
    select: { documentStorageKey: true, documentName: true },
  });
  if (!program?.documentStorageKey) return err("NO_FILE", "Dokumen kurikulum belum tersedia", 404);

  try {
    const stored = await readObject(program.documentStorageKey);
    if (!stored) return err("FILE_MISSING", "Berkas tidak ditemukan di penyimpanan", 410);
    const mime = contentTypeForName(program.documentStorageKey);
    const disposition = isInlineSafe(mime) ? "inline" : "attachment";
    const name = program.documentName ?? "kurikulum";
    return new Response(stored.body, {
      headers: {
        "Content-Type": mime,
        ...(stored.contentLength ? { "Content-Length": String(stored.contentLength) } : {}),
        "Content-Disposition": contentDisposition(disposition, name),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (e) {
    logServerError("diklat.curriculum.document.download", e);
    return err("STORAGE_ERROR", safeErrorMessage("STORAGE_ERROR"), 502);
  }
}
