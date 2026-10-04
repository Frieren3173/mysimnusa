import { NextRequest } from "next/server";
import * as fs from "fs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { requireMigrationUser } from "@/lib/migration/auth";
import { scanXlsxFile, migrationFilePath, ensureStorage } from "@/lib/migration/source";
import { getConnectionPublic, fetchGoogle } from "@/lib/google/auth";
import type { Prisma } from "@prisma/client";

const ScanSchema = z.object({
  sheetUrl: z.string().trim().min(1, "URL spreadsheet wajib diisi").max(500),
  sheetName: z.string().trim().max(200).optional(),
});

const SHEET_ID_RE = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;

export async function POST(req: NextRequest) {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  const connection = await getConnectionPublic();
  if (connection.status !== "CONNECTED") {
    return err("NOT_CONNECTED", "Sambungkan akun Google terlebih dahulu", 409);
  }

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(ScanSchema, body);
  if (error) return error;

  const idMatch = data.sheetUrl.match(SHEET_ID_RE) ?? data.sheetUrl.match(/^([a-zA-Z0-9-_]{10,})$/);
  if (!idMatch) {
    return err("INVALID_URL", "URL tidak mengandung ID spreadsheet Google", 422, {
      sheetUrl: ["Format: https://docs.google.com/spreadsheets/d/<ID>/edit"],
    });
  }
  const sheetId = idMatch[1]!;

  let batch: { id: string } | null = null;
  try {
    ensureStorage();
    batch = await prisma.migrationBatch.create({
      data: {
        createdBy: user.id,
        sourceType: "GOOGLE_SHEETS",
        sourceReference: data.sheetUrl,
        status: "SCANNING",
      },
    });
    const batchId = batch.id;

    // 1. Sheet metadata (read-only)
    const metaRes = await fetchGoogle(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}?fields=sheets(properties(title,gridProperties(rowCount,columnCount)))`
    );
    if (!metaRes.ok) {
      if (metaRes.status === 404) throw new Error("Spreadsheet tidak ditemukan atau tidak dapat diakses");
      if (metaRes.status === 403) throw new Error("Izin akses ditolak — pastikan Sheet dibagikan ke akun ini");
      throw new Error(`Gagal membaca metadata spreadsheet (HTTP ${metaRes.status})`);
    }
    const meta = (await metaRes.json()) as {
      sheets?: { properties?: { title?: string; gridProperties?: { rowCount?: number; columnCount?: number } } }[];
    };
    const sheetTitles = (meta.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);

    // 2. Export native sheet → XLSX (reuse the whole XLSX pipeline downstream)
    const exportRes = await fetchGoogle(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sheetId)}/export?mimeType=${encodeURIComponent("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}`
    );
    if (!exportRes.ok) {
      if (exportRes.status === 403) throw new Error("Izin ekspor ditolak — Sheet harus dapat diakses akun ini");
      throw new Error(`Gagal mengunduh spreadsheet (HTTP ${exportRes.status})`);
    }
    const buf = Buffer.from(await exportRes.arrayBuffer());
    if (buf.length === 0) throw new Error("File hasil ekspor kosong");

    const filePath = migrationFilePath(batchId);
    fs.writeFileSync(filePath, buf);

    const scan = scanXlsxFile(filePath, `${sheetId}.xlsx`);

    for (const col of scan.columns) {
      await prisma.migrationFieldMapping.upsert({
        where: { batchId_sourceField: { batchId, sourceField: col.source } },
        update: { targetField: col.target, confidence: col.confidence, isIgnored: col.target === "" },
        create: { batchId, sourceField: col.source, targetField: col.target, confidence: col.confidence, isIgnored: col.target === "" },
      });
    }

    const updated = await prisma.migrationBatch.update({
      where: { id: batchId },
      data: {
        status: "MAPPING_REVIEW",
        sourceFileKey: `${sheetId}.xlsx`,
        scanResult: {
          ...(scan as unknown as Record<string, unknown>),
          google: { sheetId, sheetNames: sheetTitles, sheetName: data.sheetName ?? sheetTitles[0] ?? null },
        } as Prisma.InputJsonValue,
      },
      include: { fieldMappings: { orderBy: { sourceField: "asc" } } },
    });

    return ok({ batch: updated, scan });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal memindai spreadsheet";
    if (batch?.id) {
      await prisma.migrationBatch
        .update({ where: { id: batch.id }, data: { status: "FAILED" } })
        .catch(() => undefined);
    }
    return err("SCAN_FAILED", message, 502);
  }
}
