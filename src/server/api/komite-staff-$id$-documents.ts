import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { ok, err } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { deriveDocumentStatus } from "@/lib/utils";
import { putObject } from "@/lib/storage";
import { validateUpload, EXT_MIME } from "@/lib/file-type";

const MAX_SIZE = 15 * 1024 * 1024; // 15 MB
const ALLOWED_EXT = Object.keys(EXT_MIME); // pdf, jpg/jpeg, png, webp, doc/docx, xls/xlsx

/** Lists a staff member's documents, optionally filtered by document-type code. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.KOMITE_DOCUMENT_READ);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id: staffId } = await params;
  const typeCode = req.nextUrl.searchParams.get("type")?.trim();

  try {
    const documents = await prisma.document.findMany({
      where: {
        staffId,
        ...(typeCode ? { documentType: { code: typeCode } } : {}),
      },
      include: { documentType: true },
      orderBy: [{ expiryDate: "asc" }, { createdAt: "desc" }],
      take: 100,
    });

    return ok({
      documents: documents.map((d) => ({
        id: d.id,
        filename: d.filename,
        number: d.number,
        mimeType: d.mimeType,
        expiryDate: d.expiryDate?.toISOString() ?? null,
        isLifetime: d.isLifetime,
        status: d.status,
        documentType: { code: d.documentType.code, name: d.documentType.name },
        hasFile: Boolean(d.storageKey || d.fileId || d.legacyDriveUrl),
      })),
    });
  } catch (e) {
    return err("LIST_FAILED", e instanceof Error ? e.message : "Gagal memuat dokumen", 500);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.KOMITE_DOCUMENT_UPLOAD);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id: staffId } = await params;
  const staff = await prisma.staff.findUnique({ where: { id: staffId } });
  if (!staff) return err("NOT_FOUND", "Data tenaga tidak ditemukan", 404);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err("INVALID_FORM", "Request harus multipart/form-data", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return err("NO_FILE", "File belum dipilih", 422);
  }
  if (file.size > MAX_SIZE) {
    return err("FILE_TOO_LARGE", "Ukuran file maksimal 15 MB", 413);
  }

  const code = String(form.get("code") ?? "").trim();
  if (!code) return err("NO_TYPE", "Jenis dokumen wajib dipilih", 422);

  // Read the bytes once, then decide the type from the extension + magic bytes.
  // The browser-supplied `file.type` is only a consistency hint — never trusted.
  const bytes = await file.arrayBuffer();
  const verdict = validateUpload(file.name, file.type, new Uint8Array(bytes), ALLOWED_EXT);
  if (!verdict.ok) return err(verdict.code, verdict.message, 415);

  const expiryRaw = String(form.get("expiryDate") ?? "").trim();
  const isLifetime = String(form.get("isLifetime") ?? "") === "true";
  const number = String(form.get("number") ?? "").trim() || null;
  const issueRaw = String(form.get("issueDate") ?? "").trim();
  const expiryDate = expiryRaw ? new Date(expiryRaw) : null;
  const issueDate = issueRaw ? new Date(issueRaw) : null;
  if (expiryDate && isNaN(expiryDate.getTime())) {
    return err("INVALID_DATE", "Tanggal berakhir tidak valid", 422);
  }

  try {
    // Resolve the document type. New types are only created for a strictly
    // formatted code AND by a user with admin-settings rights; everyone else may
    // only pick an existing type (prevents free-form type injection).
    const existingType = await prisma.documentType.findUnique({ where: { code } });
    let docType = existingType;
    if (!docType) {
      const CODE_RE = /^[A-Z0-9_]{2,40}$/;
      if (!CODE_RE.test(code)) {
        return err("INVALID_TYPE_CODE", "Kode jenis dokumen tidak valid", 422);
      }
      const mayCreateType =
        user.hasPermission(PERMISSIONS.ADMIN_SETTINGS) || user.isSuperAdmin();
      if (!mayCreateType) {
        return err("UNKNOWN_TYPE", "Jenis dokumen tidak dikenal", 422);
      }
      docType = await prisma.documentType.create({ data: { code, name: code } });
    }

    // Files are stored by the active storage provider (Google Drive in
    // production); Neon only keeps the metadata below. Keys follow
    // staff/{staffId}/{category}/{generated-file-name}.
    const checksum = createHash("sha256").update(Buffer.from(bytes)).digest("hex");

    const stored = await putObject({
      scope: "staff",
      ownerId: staffId,
      category: code.toLowerCase(),
      fileName: file.name,
      contentType: verdict.mime,
      body: bytes,
    });

    const document = await prisma.document.create({
      data: {
        staffId,
        documentTypeId: docType.id,
        number,
        issueDate,
        expiryDate,
        isLifetime,
        status: deriveDocumentStatus(expiryDate, isLifetime),
        filename: file.name,
        mimeType: verdict.mime,
        fileSize: stored.bytes,
        storageKey: stored.storageKey,
        storageProvider: stored.provider,
        checksum,
        uploadedBy: user.id,
      },
      include: { documentType: true },
    });

    return ok({ document });
  } catch (e) {
    return err("UPLOAD_FAILED", e instanceof Error ? e.message : "Gagal mengunggah file", 500);
  }
}
