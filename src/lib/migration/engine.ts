import { prisma } from "@/lib/prisma";
import { deriveDocumentStatus } from "@/lib/utils";
import {
  readSheetObjects,
  parseExpiryValue,
  parseDateValue,
  isDriveUrl,
  extractDriveId,
  normalizeName,
  rowHash,
  migrationFilePath,
  ScanResult,
} from "./source";

// ─── Batch context ─────────────────────────────

interface DocField {
  file?: unknown;
  expiry?: unknown;
  expiryAlt?: unknown;
  number?: unknown;
}

interface ExtractedRow {
  index: number; // 1-based data row number
  sourceId: string;
  hash: string;
  staff: {
    name: string;
    nip: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    dateOfBirth: Date | null;
    profession: string;
    room: string | null;
    photoUrl: string | null;
  };
  educationLevel: string | null;
  documents: Record<string, DocField>;
  competencies: Record<string, unknown>;
  warnings: string[];
  error: string | null;
  duplicate: string | null;
}

function getScan(batchId: string, scan: unknown): ScanResult | null {
  if (!scan || typeof scan !== "object") return null;
  void batchId;
  return scan as ScanResult;
}

/** Read + merge all sheets into extracted, validated rows. */
async function extractRows(batchId: string): Promise<ExtractedRow[]> {
  const batch = await prisma.migrationBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: { fieldMappings: true },
  });
  const scan = getScan(batchId, batch.scanResult);
  if (!scan || !batch.sourceFileKey) {
    throw new Error("Batch belum di-scan atau file sumber tidak ada.");
  }
  const filePath = migrationFilePath(batch.id);
  const mappings = batch.fieldMappings.filter((m) => !m.isIgnored && m.targetField);

  const primaryRows = readSheetObjects(filePath, scan.primarySheet);

  // Secondary sheet indexes for enrichment
  const sheetNames = scan.sheets.map((s) => s.name);
  const fr2Name = sheetNames.find((n) => /form responses 2/i.test(n));
  const alamatName = sheetNames.find((n) => /alamat/i.test(n));

  const fr2ByNip = new Map<string, Record<string, unknown>>();
  if (fr2Name) {
    for (const r of readSheetObjects(filePath, fr2Name)) {
      const nipKey = Object.keys(r).find((k) => /nip/i.test(k));
      const nip = nipKey ? String(r[nipKey] ?? "").trim() : "";
      if (nip) fr2ByNip.set(nip, r);
    }
  }
  const alamatByName = new Map<string, Record<string, unknown>>();
  if (alamatName) {
    for (const r of readSheetObjects(filePath, alamatName)) {
      const nameKey = Object.keys(r).find((k) => /nama/i.test(k));
      const nm = nameKey ? normalizeName(String(r[nameKey] ?? "")) : "";
      if (nm) alamatByName.set(nm, r);
    }
  }

  // Existing staff for duplicate detection
  const existing = await prisma.staff.findMany({
    select: { id: true, nip: true, name: true, profession: true },
  });
  const byNip = new Map(existing.filter((s) => s.nip).map((s) => [s.nip!, s]));
  const byKey = new Map(existing.map((s) => [`${normalizeName(s.name)}|${s.profession}`, s]));

  const seenNip = new Map<string, number>();
  const out: ExtractedRow[] = [];

  let dataRow = 0;
  for (const raw of primaryRows) {
    if (!Object.values(raw).some((v) => v !== null && v !== undefined && v !== "")) continue;
    dataRow++;

    const rec: ExtractedRow = {
      index: dataRow,
      sourceId: `row:${dataRow}`,
      hash: rowHash(raw as Record<string, unknown>),
      staff: {
        name: "",
        nip: null,
        email: null,
        phone: null,
        address: null,
        dateOfBirth: null,
        profession: "",
        room: null,
        photoUrl: null,
      },
      educationLevel: null,
      documents: {},
      competencies: {},
      warnings: [],
      error: null,
      duplicate: null,
    };

    // Apply persisted field mappings
    for (const m of mappings) {
      const v = raw[m.sourceField];
      const isEmpty = v === null || v === undefined || v === "";
      const t = m.targetField;

      if (t.startsWith("staff.")) {
        const field = t.slice(6);
        if (isEmpty) continue;
        if (field === "nip") rec.staff.nip = String(v).trim();
        else if (field === "name") rec.staff.name = String(v).trim();
        else if (field === "email") rec.staff.email = String(v).trim();
        else if (field === "phone") rec.staff.phone = String(v).trim();
        else if (field === "address") rec.staff.address = String(v).trim();
        else if (field === "room") rec.staff.room = String(v).trim();
        else if (field === "profession") rec.staff.profession = String(v).trim();
        else if (field === "dateOfBirth") rec.staff.dateOfBirth = parseDateValue(v);
        else if (field === "photoUrl" && isDriveUrl(String(v))) rec.staff.photoUrl = String(v);
      } else if (t === "education.level") {
        if (!isEmpty) rec.educationLevel = String(v).trim();
      } else if (t.startsWith("document.")) {
        const rest = t.slice(9);
        const dot = rest.lastIndexOf(".");
        const code = rest.slice(0, dot);
        const role = rest.slice(dot + 1);
        if (!rec.documents[code]) rec.documents[code] = {};
        const docDraft = rec.documents[code] as Record<string, string | undefined>;
        docDraft[role] = isEmpty ? undefined : (v as string);
      } else if (t.startsWith("competency.")) {
        const code = t.slice(11);
        if (!isEmpty) rec.competencies[code] = v;
      }
    }

    // ── Enrichment from secondary sheets (fill gaps only) ──
    const fr2 = rec.staff.nip ? fr2ByNip.get(rec.staff.nip) : undefined;
    const alamat = alamatByName.get(normalizeName(rec.staff.name));
    if (alamat && !rec.staff.address) {
      const aKey = Object.keys(alamat).find((k) => /alamat/i.test(k));
      if (aKey && alamat[aKey]) rec.staff.address = String(alamat[aKey]).trim();
    }
    if (fr2) {
      if (!rec.staff.dateOfBirth) {
        const k = Object.keys(fr2).find((key) => /tanggal lahir/i.test(key));
        if (k) rec.staff.dateOfBirth = parseDateValue(fr2[k]);
      }
      if (!rec.staff.phone) {
        const k = Object.keys(fr2).find((key) => /handphone|nomor hp/i.test(key));
        if (k && fr2[k]) rec.staff.phone = String(fr2[k]).trim();
      }
      if (!rec.documents.FOTO?.file) {
        const k = Object.keys(fr2).find((key) => /foto/i.test(key));
        if (k && fr2[k]) {
          if (!rec.documents.FOTO) rec.documents.FOTO = {};
          rec.documents.FOTO.file = fr2[k];
        }
      }
      if (!rec.documents.SURAT_PENGALAMAN?.file) {
        const k = Object.keys(fr2).find((key) => /surat pengalaman/i.test(key));
        if (k && fr2[k]) {
          if (!rec.documents.SURAT_PENGALAMAN) rec.documents.SURAT_PENGALAMAN = {};
          rec.documents.SURAT_PENGALAMAN.file = fr2[k];
        }
      }
    }

    // ── Validation ──
    if (!rec.staff.name) {
      rec.error = "Nama wajib diisi";
      out.push(rec);
      continue;
    }
    if (!rec.staff.profession) {
      rec.staff.profession = "Belum Ditentukan";
      rec.warnings.push("Profesi kosong");
    }

    if (rec.staff.nip) {
      const dupRow = seenNip.get(rec.staff.nip);
      if (dupRow) {
        rec.duplicate = `NIP sama dengan baris ${dupRow}`;
        seenNip.set(rec.staff.nip, dataRow);
        out.push(rec);
        continue;
      }
      seenNip.set(rec.staff.nip, dataRow);

      const dbMatch = byNip.get(rec.staff.nip);
      if (dbMatch && normalizeName(dbMatch.name) !== normalizeName(rec.staff.name)) {
        rec.duplicate = `NIP sudah terdaftar atas nama "${dbMatch.name}"`;
        out.push(rec);
        continue;
      }
    } else {
      rec.warnings.push("NIP kosong");
    }

    const key = `${normalizeName(rec.staff.name)}|${rec.staff.profession}`;
    const nameMatch = byKey.get(key);
    if (nameMatch && (!rec.staff.nip || nameMatch.nip !== rec.staff.nip)) {
      rec.duplicate = `Kemungkinan duplikat dari "${nameMatch.name}" (profesi sama)`;
      out.push(rec);
      continue;
    }

    out.push(rec);
  }

  return out;
}

function staffKey(r: ExtractedRow): string {
  return (
    r.staff.nip ??
    r.staff.email ??
    `${normalizeName(r.staff.name)}|${r.staff.profession}`
  );
}

async function resolveAction(r: ExtractedRow): Promise<"CREATE" | "UPDATE"> {
  if (r.staff.nip) {
    const byNip = await prisma.staff.findUnique({ where: { nip: r.staff.nip } });
    if (byNip) return "UPDATE";
  }
  const byLegacy = await prisma.staff.findFirst({
    where: { legacySourceId: `xlsx:${staffKey(r)}` },
  });
  if (byLegacy) return "UPDATE";
  return "CREATE";
}

// ─── ASSESMENT (sudah / belum masuk DB) ────────

export interface RowVerdict {
  staffExists: boolean;
  docsAlready: number;
  docsNew: number;
  newDocCodes: string[];
  isNew: boolean;
}

export interface BatchAssessment {
  rowsAssessed: number;
  staffNew: number;
  staffAlready: number;
  docsTotal: number;
  docsAlready: number;
  docsNew: number;
  actionableRows: number;
  rows: {
    sourceId: string;
    name: string;
    staffExists: boolean;
    docsNew: number;
    newDocCodes: string[];
  }[];
}

async function assessRow(r: ExtractedRow): Promise<RowVerdict> {
  const key = staffKey(r);
  const action = await resolveAction(r);
  const staffExists = action === "UPDATE";

  const checks: { legacyDocId: string; driveId: string | null; code: string }[] = [];
  for (const [code, fields] of Object.entries(r.documents)) {
    const fileVal =
      fields.file !== undefined && fields.file !== null && fields.file !== ""
        ? String(fields.file)
        : null;
    const exp = parseExpiryValue(fields.expiry);
    const alt = parseExpiryValue(fields.expiryAlt);
    const expiryDate = exp.date ?? alt.date;
    const isLifetime = exp.lifetime || alt.lifetime;
    // Kriteria sama dengan importOne: tanpa berkas/tanggal — bukan data
    if (!fileVal && !expiryDate && !isLifetime) continue;
    const driveId = fileVal && isDriveUrl(fileVal) ? extractDriveId(fileVal) : null;
    checks.push({ legacyDocId: `xlsx:${key}:${code}`, driveId, code });
  }

  let docsAlready = 0;
  let docsNew = 0;
  const newDocCodes: string[] = [];

  if (checks.length > 0) {
    const driveIds = checks.map((c) => c.driveId).filter(Boolean) as string[];
    const found = await prisma.document.findMany({
      where: {
        OR: [
          { legacySourceId: { in: checks.map((c) => c.legacyDocId) } },
          ...(driveIds.length ? [{ legacyDriveId: { in: driveIds } }] : []),
        ],
      },
      select: { legacySourceId: true, legacyDriveId: true, storageKey: true, legacyDriveUrl: true },
    });
    const byLegacy = new Map(found.filter((d) => d.legacySourceId).map((d) => [d.legacySourceId!, d]));
    const byDrive = new Map(found.filter((d) => d.legacyDriveId).map((d) => [d.legacyDriveId!, d]));

    for (const c of checks) {
      const row = byLegacy.get(c.legacyDocId) ?? (c.driveId ? byDrive.get(c.driveId) : undefined);
      const srcHasLink = c.driveId !== null;
      const dbHasFile = !!row && (row.storageKey !== null || row.legacyDriveUrl !== null);
      const isNew = !row || (srcHasLink && !dbHasFile);
      if (isNew) {
        docsNew++;
        newDocCodes.push(c.code);
      } else {
        docsAlready++;
      }
    }
  }

  return { staffExists, docsAlready, docsNew, newDocCodes, isNew: !staffExists || docsNew > 0 };
}

export async function assessBatch(batchId: string): Promise<BatchAssessment> {
  const items = await prisma.migrationItem.findMany({
    where: { batchId, status: { in: ["PENDING", "RETRYING"] } },
    select: { sourceId: true },
  });
  const rows = await extractRows(batchId);
  const rowById = new Map(rows.map((r) => [r.sourceId, r]));

  let staffNew = 0;
  let staffAlready = 0;
  let docsAlready = 0;
  let docsNew = 0;
  const actionable: BatchAssessment["rows"] = [];

  for (const item of items) {
    const r = rowById.get(item.sourceId);
    if (!r || r.error || r.duplicate) continue;
    const v = await assessRow(r);
    if (v.staffExists) staffAlready++;
    else staffNew++;
    docsAlready += v.docsAlready;
    docsNew += v.docsNew;
    if (v.isNew) {
      actionable.push({
        sourceId: r.sourceId,
        name: r.staff.name,
        staffExists: v.staffExists,
        docsNew: v.docsNew,
        newDocCodes: v.newDocCodes,
      });
    }
  }

  return {
    rowsAssessed: staffNew + staffAlready,
    staffNew,
    staffAlready,
    docsTotal: docsAlready + docsNew,
    docsAlready,
    docsNew,
    actionableRows: actionable.length,
    rows: actionable,
  };
}

// ─── VALIDATE ──────────────────────────────────

export async function validateBatch(batchId: string) {
  const rows = await extractRows(batchId);

  await prisma.$transaction([
    prisma.migrationItem.deleteMany({ where: { batchId } }),
  ]);

  let failed = 0;
  let duplicates = 0;
  let warnings = 0;
  const items: {
    batchId: string;
    entityType: string;
    sourceId: string;
    sourceHash: string;
    action: string;
    status: "PENDING" | "FAILED" | "DUPLICATE_REVIEW";
    errorCode: string | null;
    errorMessage: string | null;
  }[] = [];

  for (const r of rows) {
    if (r.error) {
      failed++;
      items.push({
        batchId,
        entityType: "STAFF",
        sourceId: r.sourceId,
        sourceHash: r.hash,
        action: "REJECT",
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage: r.error,
      });
      continue;
    }
    if (r.duplicate) {
      duplicates++;
      items.push({
        batchId,
        entityType: "STAFF",
        sourceId: r.sourceId,
        sourceHash: r.hash,
        action: "SKIP",
        status: "DUPLICATE_REVIEW",
        errorCode: "DUPLICATE_CANDIDATE",
        errorMessage: r.duplicate,
      });
      continue;
    }
    if (r.warnings.length > 0) warnings++;
    const action = await resolveAction(r);
    items.push({
      batchId,
      entityType: "STAFF",
      sourceId: r.sourceId,
      sourceHash: r.hash,
      action,
      status: "PENDING",
      errorCode: null,
      errorMessage: r.warnings.length ? r.warnings.join("; ") : null,
    });
  }

  // Insert in chunks
  for (let i = 0; i < items.length; i += 200) {
    await prisma.migrationItem.createMany({ data: items.slice(i, i + 200) });
  }

  const planned = items.filter((i) => i.status === "PENDING");
  const plannedCreate = planned.filter((i) => i.action === "CREATE").length;
  const plannedUpdate = planned.filter((i) => i.action === "UPDATE").length;

  await prisma.migrationBatch.update({
    where: { id: batchId },
    data: {
      status: "READY",
      isDryRun: false,
      sourceCount: rows.length,
      createdCount: plannedCreate,
      updatedCount: plannedUpdate,
      skippedCount: duplicates,
      failedCount: failed,
      warningCount: warnings,
      duplicateCount: duplicates,
    },
  });

  return {
    sourceCount: rows.length,
    valid: planned.length,
    create: plannedCreate,
    update: plannedUpdate,
    duplicates,
    failed,
    warnings,
  };
}

// ─── DRY RUN ───────────────────────────────────

export async function dryRunBatch(batchId: string) {
  const items = await prisma.migrationItem.findMany({ where: { batchId } });
  const pending = items.filter((i) => i.status === "PENDING");
  const create = pending.filter((i) => i.action === "CREATE").length;
  const update = pending.filter((i) => i.action === "UPDATE").length;

  // Re-resolve actions against current DB (deterministic preview)
  const rows = await extractRows(batchId);
  const rowById = new Map(rows.map((r) => [r.sourceId, r]));
  let realCreate = 0;
  let realUpdate = 0;
  for (const item of pending) {
    const r = rowById.get(item.sourceId);
    if (!r) continue;
    const action = await resolveAction(r);
    if (action === "CREATE") realCreate++;
    else realUpdate++;
  }

  await prisma.migrationBatch.update({
    where: { id: batchId },
    data: {
      isDryRun: true,
      createdCount: realCreate,
      updatedCount: realUpdate,
      skippedCount: items.filter((i) => i.status !== "PENDING").length,
      failedCount: items.filter((i) => i.status === "FAILED").length,
      duplicateCount: items.filter((i) => i.status === "DUPLICATE_REVIEW").length,
    },
  });

  return {
    plannedItems: pending.length,
    create: realCreate,
    update: realUpdate,
    skip: items.filter((i) => i.status !== "PENDING").length,
    failed: items.filter((i) => i.status === "FAILED").length,
    note:
      create !== realCreate || update !== realUpdate
        ? "Basis data berubah sejak validasi — angka diperbarui."
        : null,
  };
}

// ─── IMPORT ────────────────────────────────────

async function importOne(
  rows: ExtractedRow[],
  sourceId: string,
  userId: string | null
): Promise<{ staffId: string; created: boolean; docs: number }> {
  const r = rows.find((x) => x.sourceId === sourceId);
  if (!r) throw new Error(`Baris ${sourceId} tidak ditemukan di file sumber.`);
  if (r.error) throw new Error(r.error);

  const key = staffKey(r);
  const legacyId = `xlsx:${key}`;

  return await prisma.$transaction(async (tx) => {
    // Room
    let roomId: string | null = null;
    if (r.staff.room) {
      const existing = await tx.room.findFirst({
        where: { name: { equals: r.staff.room } },
      });
      const room = existing ?? (await tx.room.create({ data: { name: r.staff.room } }));
      roomId = room.id;
    }

    // Staff upsert (by nip, else legacy id)
    let staff = r.staff.nip
      ? await tx.staff.findUnique({ where: { nip: r.staff.nip } })
      : await tx.staff.findFirst({ where: { legacySourceId: legacyId } });
    if (!staff) {
      staff = await tx.staff.findFirst({ where: { legacySourceId: legacyId } });
    }

    const staffData = {
      name: r.staff.name,
      nip: r.staff.nip,
      email: r.staff.email,
      phone: r.staff.phone,
      address: r.staff.address,
      dateOfBirth: r.staff.dateOfBirth,
      profession: r.staff.profession,
      roomId,
      photoUrl: r.staff.photoUrl ?? undefined,
      isActive: true,
      employmentStatus: "ACTIVE",
      legacySourceId: legacyId,
      importedAt: new Date(),
    };

    let created = false;
    if (staff) {
      staff = await tx.staff.update({ where: { id: staff.id }, data: staffData });
    } else {
      created = true;
      staff = await tx.staff.create({ data: staffData });
    }

    // Education
    if (r.educationLevel) {
      const edu = await tx.staffEducation.findFirst({
        where: { staffId: staff.id, level: r.educationLevel },
      });
      if (!edu) {
        await tx.staffEducation.create({
          data: {
            staffId: staff.id,
            level: r.educationLevel,
            institution: "Belum Diketahui",
            documentUrl: null,
          },
        });
      }
    }

    // Documents
    let docCount = 0;
    for (const [code, fields] of Object.entries(r.documents)) {
      const docType = await tx.documentType.upsert({
        where: { code },
        update: {},
        create: {
          code,
          name: code,
          hasExpiry: code === "STR" || code === "SIP" || code === "BTCLS" || code === "ACLS",
        },
      });

      const fileVal = fields.file !== undefined && fields.file !== null && fields.file !== "" ? String(fields.file) : null;
      const exp = parseExpiryValue(fields.expiry);
      const alt = parseExpiryValue(fields.expiryAlt);
      const expiryDate = exp.date ?? alt.date;
      const isLifetime = exp.lifetime || alt.lifetime;
      const driveUrl = fileVal && isDriveUrl(fileVal) ? fileVal : null;

      // Nothing to store?
      if (!fileVal && !expiryDate && !isLifetime) continue;

      const legacyDocId = `xlsx:${key}:${code}`;
      const existing = await tx.document.findFirst({
        where: { staffId: staff.id, legacySourceId: legacyDocId },
      });

      // Already linked to a production destination file → nothing to do (idempotent).
      // A record that only has a legacy link is upgraded below to the migrated file.
      if (existing && existing.storageKey && existing.storageProvider) continue;

      const status = deriveDocumentStatus(expiryDate, isLifetime);
      const sourceDriveId = driveUrl ? extractDriveId(driveUrl) : null;

      // If this source file was already migrated to the production storage
      // provider, link the document to the DESTINATION file instead of the old
      // source link. The storage_migration_items table is the authoritative
      // sourceFileId → destinationFileId mapping.
      const migrated = sourceDriveId
        ? await tx.storageMigrationItem.findFirst({
            where: { sourceFileId: sourceDriveId, status: "VERIFIED", destinationFileId: { not: null } },
            select: { destinationFileId: true, destinationKey: true, mimeType: true, originalFilename: true, finalSize: true, finalChecksum: true },
            orderBy: { processedAt: "desc" },
          })
        : null;

      const data = {
        staffId: staff.id,
        documentTypeId: docType.id,
        expiryDate,
        isLifetime,
        status,
        legacySourceId: legacyDocId,
        // Provenance: keep the original source id/url for auditing.
        legacyDriveUrl: driveUrl,
        legacyDriveId: sourceDriveId,
        storageProvider: migrated ? "google-drive" : null,
        storageKey: migrated?.destinationKey ?? null,
        fileId: migrated?.destinationFileId ?? null,
        mimeType: migrated?.mimeType ?? null,
        fileSize: migrated?.finalSize ?? null,
        checksum: migrated?.finalChecksum ?? null,
        importedAt: new Date(),
        filename: migrated?.originalFilename ?? (driveUrl ? null : fileVal),
        uploadedBy: userId,
        notes: migrated
          ? "Berkas telah dimigrasikan ke penyimpanan produksi (Google Drive tujuan)"
          : driveUrl
            ? "Diimpor dari XLSX — menunggu sinkronisasi Drive"
            : undefined,
      };

      if (existing) {
        await tx.document.update({ where: { id: existing.id }, data });
      } else {
        await tx.document.create({ data });
        docCount++;
      }

      if (code === "FOTO" && (migrated?.destinationKey || driveUrl)) {
        // Prefer the migrated destination reference for the staff photo.
        await tx.staff.update({ where: { id: staff.id }, data: { photoUrl: migrated?.destinationKey ?? driveUrl } });
      }
    }

    // Competencies
    for (const [code, val] of Object.entries(r.competencies)) {
      const competency = await tx.competency.upsert({
        where: { code },
        update: {},
        create: { code, name: code.charAt(0) + code.slice(1).toLowerCase() },
      });
      const valStr = val === null || val === undefined ? "" : String(val).trim();
      const url = isDriveUrl(valStr) ? valStr : null;
      await tx.staffCompetency.upsert({
        where: { staffId_competencyId: { staffId: staff.id, competencyId: competency.id } },
        update: { documentUrl: url ?? undefined },
        create: {
          staffId: staff.id,
          competencyId: competency.id,
          documentUrl: url,
        },
      });
    }

    return { staffId: staff.id, created, docs: docCount };
  });
}

export async function importBatch(
  batchId: string,
  userId: string | null = null,
  opts?: { onlyNew?: boolean }
) {
  const batch = await prisma.migrationBatch.findUniqueOrThrow({ where: { id: batchId } });
  if (!["READY", "COMPLETED", "FAILED", "PAUSED", "RECONCILED"].includes(batch.status)) {
    throw new Error(`Status batch "${batch.status}" tidak mengizinkan import.`);
  }

  await prisma.migrationBatch.update({
    where: { id: batchId },
    data: { status: "IMPORTING", isDryRun: false, startedAt: batch.startedAt ?? new Date() },
  });

  const items = await prisma.migrationItem.findMany({
    where: { batchId, status: { in: ["PENDING", "RETRYING"] } },
    orderBy: { sourceId: "asc" },
  });

  const rows = await extractRows(batchId);

  let created = 0;
  let updated = 0;
  let docsImported = 0;

  for (const item of items) {
    try {
      if (opts?.onlyNew) {
        const r = rows.find((x) => x.sourceId === item.sourceId);
        if (r && !r.error && !r.duplicate) {
          const verdict = await assessRow(r);
          if (!verdict.isNew) {
            await prisma.migrationItem.update({
              where: { id: item.id },
              data: {
                status: "SKIPPED",
                action: "SKIP",
                processedAt: new Date(),
                errorCode: null,
                errorMessage: null,
              },
            });
            continue;
          }
        }
      }
      const res = await importOne(rows, item.sourceId, userId);
      if (res.created) created++;
      else updated++;
      docsImported += res.docs;
      await prisma.migrationItem.update({
        where: { id: item.id },
        data: {
          status: "SUCCESS",
          targetId: res.staffId,
          staffId: res.staffId,
          action: res.created ? "CREATE" : "UPDATE",
          processedAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });
    } catch (e) {
      await prisma.migrationItem.update({
        where: { id: item.id },
        data: {
          status: "FAILED",
          errorCode: "IMPORT_ERROR",
          errorMessage: e instanceof Error ? e.message : "Gagal mengimpor baris",
          retryCount: { increment: 1 },
          processedAt: new Date(),
        },
      });
    }
  }

  const allItems = await prisma.migrationItem.findMany({ where: { batchId } });
  const skipped = allItems.filter(
    (i) => i.status === "SKIPPED" || i.status === "DUPLICATE_REVIEW"
  ).length;
  const totalFailed = allItems.filter((i) => i.status === "FAILED").length;

  await prisma.migrationBatch.update({
    where: { id: batchId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      createdCount: created,
      updatedCount: updated,
      skippedCount: skipped,
      failedCount: totalFailed,
    },
  });

  return { created, updated, failed: totalFailed, skipped, docsImported, processed: items.length };
}

// ─── RETRY ─────────────────────────────────────

export async function retryFailedItems(batchId: string, userId: string | null = null) {
  await prisma.migrationItem.updateMany({
    where: { batchId, status: "FAILED", errorCode: "IMPORT_ERROR" },
    data: { status: "RETRYING" },
  });
  return importBatch(batchId, userId);
}

/** Force-import a duplicate-review item. */
export async function forceImportItem(itemId: string, userId: string | null = null) {
  const item = await prisma.migrationItem.findUniqueOrThrow({ where: { id: itemId } });
  if (item.status !== "DUPLICATE_REVIEW") {
    throw new Error("Hanya item duplikat yang dapat dipaksa diimpor.");
  }
  await prisma.migrationItem.update({
    where: { id: itemId },
    data: { status: "RETRYING", action: "UPDATE", errorCode: null, errorMessage: null },
  });
  return importBatch(item.batchId, userId);
}

// ─── RECONCILE ─────────────────────────────────

export async function reconcileBatch(batchId: string) {
  const batch = await prisma.migrationBatch.findUniqueOrThrow({ where: { id: batchId } });
  const items = await prisma.migrationItem.findMany({ where: { batchId } });

  const success = items.filter((i) => i.status === "SUCCESS");
  const failed = items.filter((i) => i.status === "FAILED");
  const dupes = items.filter((i) => i.status === "DUPLICATE_REVIEW");
  const pending = items.filter((i) => i.status === "PENDING" || i.status === "RETRYING");

  const targetStaffCount = await prisma.staff.count();
  const successStaffIds = success.map((i) => i.staffId).filter(Boolean) as string[];

  let recordsMissingDocs = 0;
  let sourceDocumentCount = 0;
  if (successStaffIds.length > 0) {
    const withDocs = await prisma.document.groupBy({
      by: ["staffId"],
      where: { staffId: { in: successStaffIds } },
      _count: true,
    });
    sourceDocumentCount = withDocs.reduce((acc, w) => acc + w._count, 0);
    const haveDocs = new Set(withDocs.map((w) => w.staffId));
    recordsMissingDocs = successStaffIds.filter((id) => !haveDocs.has(id)).length;
  }

  await prisma.migrationReconciliation.upsert({
    where: { batchId },
    update: {
      sourceStaffCount: batch.sourceCount,
      targetStaffCount,
      createdCount: success.filter((i) => i.action === "CREATE").length,
      updatedCount: success.filter((i) => i.action === "UPDATE").length,
      skippedCount: dupes.length + pending.length,
      failedCount: failed.length,
      duplicateCandidates: dupes.length,
      sourceDocumentCount,
      documentsImported: sourceDocumentCount,
      documentsFailed: failed.length,
      orphanDocuments: 0,
      recordsMissingDocs,
      reconciledAt: new Date(),
    },
    create: {
      batchId,
      sourceStaffCount: batch.sourceCount,
      targetStaffCount,
      createdCount: success.filter((i) => i.action === "CREATE").length,
      updatedCount: success.filter((i) => i.action === "UPDATE").length,
      skippedCount: dupes.length + pending.length,
      failedCount: failed.length,
      duplicateCandidates: dupes.length,
      sourceDocumentCount,
      documentsImported: sourceDocumentCount,
      documentsFailed: failed.length,
      orphanDocuments: 0,
      recordsMissingDocs,
    },
  });

  await prisma.migrationBatch.update({
    where: { id: batchId },
    data: { status: "RECONCILED" },
  });

  const recon = await prisma.migrationReconciliation.findUnique({ where: { batchId } });
  return {
    ...recon,
    successCount: success.length,
    failedItems: failed.map((f) => ({
      id: f.id,
      sourceId: f.sourceId,
      errorCode: f.errorCode,
      errorMessage: f.errorMessage,
    })),
    duplicateItems: dupes.map((d) => ({
      id: d.id,
      sourceId: d.sourceId,
      reason: d.errorMessage,
    })),
  };
}
