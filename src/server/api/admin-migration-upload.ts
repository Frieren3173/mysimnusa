import { NextRequest } from "next/server";
import * as fs from "fs";
import { prisma } from "@/lib/prisma";
import { ok, err } from "@/lib/api";
import { requireMigrationUser } from "@/lib/migration/auth";
import { scanXlsxFile, migrationFilePath, ensureStorage } from "@/lib/migration/source";
import { validateUpload } from "@/lib/file-type";
import type { Prisma } from "@prisma/client";

const MAX_SIZE = 30 * 1024 * 1024; // 30 MB

export async function POST(req: NextRequest) {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err("INVALID_FORM", "Request harus multipart/form-data", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return err("NO_FILE", "File XLSX belum dipilih", 422);
  }
  if (!/\.xlsx$/i.test(file.name)) {
    return err("INVALID_TYPE", "Hanya file .xlsx yang didukung", 415);
  }
  if (file.size > MAX_SIZE) {
    return err("FILE_TOO_LARGE", "Ukuran file maksimal 30 MB", 413);
  }

  // .xlsx is a ZIP container — verify the magic bytes before writing to disk.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const verdict = validateUpload(
    file.name,
    file.type,
    bytes,
    [".xlsx"],
  );
  if (!verdict.ok) {
    return err(verdict.code, "Berkas bukan file XLSX yang valid", 415);
  }

  try {
    ensureStorage();

    const batch = await prisma.migrationBatch.create({
      data: {
        createdBy: user.id,
        sourceType: "XLSX_FILE",
        sourceReference: file.name,
        status: "SCANNING",
      },
    });

    const filePath = migrationFilePath(batch.id);
    fs.writeFileSync(filePath, Buffer.from(bytes));

    const scan = scanXlsxFile(filePath, file.name);

    for (const col of scan.columns) {
      await prisma.migrationFieldMapping.upsert({
        where: { batchId_sourceField: { batchId: batch.id, sourceField: col.source } },
        update: {
          targetField: col.target,
          confidence: col.confidence,
          isIgnored: col.target === "",
        },
        create: {
          batchId: batch.id,
          sourceField: col.source,
          targetField: col.target,
          confidence: col.confidence,
          isIgnored: col.target === "",
        },
      });
    }

    const updated = await prisma.migrationBatch.update({
      where: { id: batch.id },
      data: {
        status: "MAPPING_REVIEW",
        sourceFileKey: file.name,
        scanResult: scan as unknown as Prisma.InputJsonValue,
      },
      include: { fieldMappings: { orderBy: { sourceField: "asc" } } },
    });

    return ok({ batch: updated, scan });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal memindai file";
    await prisma.migrationBatch
      .updateMany({
        where: { sourceReference: file.name, status: "SCANNING" },
        data: { status: "FAILED" },
      })
      .catch(() => undefined);
    return err("SCAN_FAILED", message, 500);
  }
}
