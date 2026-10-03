import { NextRequest } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { ok, err } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { deriveDocumentStatus } from "@/lib/utils";

const MAX_SIZE = 15 * 1024 * 1024; // 15 MB
const ALLOWED_EXT = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx", ".xls", ".xlsx"];

const ALLOWED_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
};

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

  const ext =
    ALLOWED_MIME[file.type] ??
    path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    return err("INVALID_TYPE", `Format file tidak didukung (${ext || "tanpa ekstensi"})`, 415);
  }

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
    const docType = await prisma.documentType.upsert({
      where: { code },
      update: {},
      create: { code, name: code },
    });

    const dir = path.join(process.cwd(), "storage", "documents", staffId);
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${randomUUID()}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(path.join(dir, filename), buffer);

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
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        storageKey: `documents/${staffId}/${filename}`,
        uploadedBy: user.id,
      },
      include: { documentType: true },
    });

    return ok({ document });
  } catch (e) {
    return err("UPLOAD_FAILED", e instanceof Error ? e.message : "Gagal mengunggah file", 500);
  }
}
