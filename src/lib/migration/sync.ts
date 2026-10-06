import { prisma } from "@/lib/prisma";
import { putObject, objectExists } from "@/lib/storage";
import { extractDriveId } from "./source";
import { googleFetch } from "@/lib/google/auth";

// ─── Status ────────────────────────────────────

export interface SyncStatus {
  total: number;
  migrated: number;
  pending: number;
  ready: number;
  failed: number;
  percent: number;
  /**
   * Number of duplicate-content GROUPS (staff + doc type + identical checksum).
   * This is NOT the number of rows.
   */
  duplicateGroups: number;
  /** Redundant Document rows that a cleanup would remove (non-canonical). */
  duplicateDocuments: number;
  /** Rows that would remain (one canonical per group). */
  documentsToKeep: number;
  /** Rows that would be removed (equals `duplicateDocuments`). */
  documentsToRemove: number;
  /**
   * Same staff + same doc type but DIFFERENT checksum = distinct files.
   * These are never touched. Surfaced so the count of "same-type extra files"
   * is visible and not mistaken for duplicates.
   */
  distinctExtraDocuments: number;
  /**
   * Groups skipped from cleanup because their canonical storage object could
   * not be verified. They are safe to keep but reported for transparency.
   */
  unverifiedGroups: number;
  /** @deprecated kept for backward compatibility — equals `duplicateGroups`. */
  duplicates: number;
}

export interface SyncResult {
  processed: number;
  succeeded: number;
  failed: number;
  failures: { id: string; name: string; error: string }[];
  status: SyncStatus;
}

/**
 * Duplicate-content detection — SAFE, checksum-based.
 *
 * A Document is a *duplicate of another* ONLY when ALL of the following hold:
 *   • same staffId
 *   • same documentTypeId
 *   • IDENTICAL checksum (the file bytes are the same)
 *   • DIFFERENT legacyDriveId (two physical copies, not the same Drive object)
 *
 * The old implementation grouped only by (staffId, documentTypeId), which
 * wrongly flagged two DIFFERENT files of the same type as duplicates. That key
 * is never used here.
 *
 * `legacyDriveId` remains the unique physical-file identity: two rows sharing a
 * Drive id are the same object (already unique in production → 0 groups), and a
 * row is never treated as a duplicate merely because other metadata matches.
 *
 * Canonical selection per group (never deleted):
 *   1. row that has a valid `storageKey`
 *   2. whose storage object can be verified to exist
 *   3. oldest `createdAt`
 *
 * A group is included in the cleanup candidates ONLY when its canonical storage
 * object is verifiable — otherwise the whole group is skipped (kept intact).
 */
export interface DedupAnalysis {
  remove: Set<string>;
  groups: number;
  duplicateDocuments: number;
  documentsToKeep: number;
  documentsToRemove: number;
  distinctExtraDocuments: number;
  unverifiedGroups: number;
}

async function analyzeDuplicates(): Promise<DedupAnalysis> {
  const docs = await prisma.document.findMany({
    select: {
      id: true,
      staffId: true,
      documentTypeId: true,
      legacyDriveId: true,
      storageKey: true,
      checksum: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // 1) Group by the true content identity: staff + type + checksum.
  const byIdentity = new Map<string, typeof docs>();
  // 2) Also track (staff + type) so we can report *distinct* files per type.
  const byPair = new Map<string, typeof docs>();
  for (const d of docs) {
    const pairKey = `${d.staffId}|${d.documentTypeId}`;
    const pair = byPair.get(pairKey);
    if (pair) pair.push(d);
    else byPair.set(pairKey, [d]);

    // Rows without a checksum cannot be proven duplicate — never group them.
    if (!d.checksum) continue;
    const idKey = `${pairKey}|${d.checksum}`;
    const arr = byIdentity.get(idKey);
    if (arr) arr.push(d);
    else byIdentity.set(idKey, [d]);
  }

  const remove = new Set<string>();
  let groups = 0;
  let duplicateDocuments = 0;
  let unverifiedGroups = 0;

  for (const g of byIdentity.values()) {
    if (g.length < 2) continue;

    // Prefer rows with a storageKey, then the oldest.
    const sorted = [...g].sort(
      (a, b) =>
        Number(!!b.storageKey) - Number(!!a.storageKey) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const canonical = sorted[0];
    const rest = sorted.slice(1);

    // Guards — only proceed when the identity is airtight.
    const sameChecksum = g.every((d) => d.checksum === canonical.checksum);
    const sameStaff = g.every((d) => d.staffId === canonical.staffId);
    const sameType = g.every((d) => d.documentTypeId === canonical.documentTypeId);
    if (!sameChecksum || !sameStaff || !sameType) continue;

    // Canonical must have a storageKey; verify the object actually exists.
    if (!canonical.storageKey) {
      unverifiedGroups++;
      continue;
    }
    let ok = false;
    try {
      ok = await objectExists(canonical.storageKey);
    } catch {
      ok = false;
    }
    if (!ok) {
      unverifiedGroups++;
      continue;
    }

    // Safe: remove only the non-canonical rows that are truly redundant.
    const redundant = rest.filter(
      (d) => d.legacyDriveId !== canonical.legacyDriveId || !d.legacyDriveId,
    );
    if (redundant.length === 0) continue;

    groups++;
    duplicateDocuments += redundant.length;
    for (const d of redundant) remove.add(d.id);
  }

  // Distinct-file extras: same staff+type, different checksum (never removed).
  let distinctExtraDocuments = 0;
  for (const g of byPair.values()) {
    if (g.length < 2) continue;
    const checksums = new Set(g.map((d) => d.checksum).filter(Boolean));
    if (checksums.size > 1) distinctExtraDocuments += g.length - 1;
  }

  return {
    remove,
    groups,
    duplicateDocuments,
    documentsToKeep: groups,
    documentsToRemove: duplicateDocuments,
    distinctExtraDocuments,
    unverifiedGroups,
  };
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const [migrated, pending, failed, dup] = await Promise.all([
    prisma.document.count({ where: { storageKey: { not: null } } }),
    prisma.document.count({ where: { legacyDriveUrl: { not: null }, storageKey: null } }),
    prisma.document.count({
      where: { legacyDriveUrl: { not: null }, storageKey: null, lastSyncError: { not: null } },
    }),
    analyzeDuplicates(),
  ]);
  const total = migrated + pending;
  return {
    total,
    migrated,
    pending,
    failed,
    ready: pending - failed,
    percent: total === 0 ? 100 : Math.round((migrated * 100) / total),
    duplicateGroups: dup.groups,
    duplicateDocuments: dup.duplicateDocuments,
    documentsToKeep: dup.documentsToKeep,
    documentsToRemove: dup.documentsToRemove,
    distinctExtraDocuments: dup.distinctExtraDocuments,
    unverifiedGroups: dup.unverifiedGroups,
    duplicates: dup.groups,
  };
}

/**
 * Delete redundant duplicate-content documents.
 *
 * Removes ONLY non-canonical rows whose checksum is identical to a verified
 * canonical within the same (staff, doc type) — never distinct files, never the
 * canonical. Storage objects are NOT deleted by default (`deleteStorage`), so
 * file blobs are preserved unless explicitly requested.
 */
export async function dedupDocuments(
  opts: { deleteStorage?: boolean } = {},
): Promise<{
  removed: number;
  groups: number;
  kept: number;
  distinctPreserved: number;
  unverifiedGroups: number;
}> {
  const a = await analyzeDuplicates();
  const ids = [...a.remove];
  if (ids.length > 0) {
    await prisma.document.deleteMany({ where: { id: { in: ids } } });
  }
  void opts; // storage deletion intentionally not performed here
  return {
    removed: ids.length,
    groups: a.groups,
    kept: a.documentsToKeep,
    distinctPreserved: a.distinctExtraDocuments,
    unverifiedGroups: a.unverifiedGroups,
  };
}

export { analyzeDuplicates };

// ─── Download dari Google Drive (link publik) ──

function looksHtml(buf: Buffer): boolean {
  const head = buf.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<head");
}

async function fetchDriveFile(fileId: string, isGoogleDoc: boolean): Promise<Buffer> {
  // Legacy source files are read through the authenticated SOURCE connection so
  // the legacy Drive never has to be made public. Google Docs are exported to
  // PDF; everything else is streamed with alt=media.
  const url = isGoogleDoc
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent("application/pdf")}`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;

  let res: Response;
  try {
    res = await googleFetch("SOURCE", url, { signal: AbortSignal.timeout(45000) });
  } catch (e) {
    const message =
      e instanceof Error && e.name === "TimeoutError"
        ? "Timeout saat mengunduh file (45s)"
        : `Gagal terhubung ke Google Drive: ${e instanceof Error ? e.message : "kesalahan tidak diketahui"}`;
    throw new Error(message);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok) {
    const detail =
      res.status === 404
        ? "File tidak ditemukan di Drive (404)"
        : res.status === 403
          ? "Akses ditolak (403) — file tidak dapat diakses akun sumber"
          : `Drive merespons HTTP ${res.status}`;
    throw new Error(detail);
  }
  if (buf.length === 0) {
    throw new Error("File kosong dari Drive");
  }
  if (looksHtml(buf)) {
    throw new Error(
      "Drive mengembalikan halaman HTML, bukan file — periksa kembali akun sumber dan ID file",
    );
  }
  return buf;
}

// ─── Deteksi tipe file dari magic bytes ─────────

interface FileMeta {
  ext: string;
  mime: string;
}

const MAGIC: { bytes: number[]; ext: string; mime: string }[] = [
  { bytes: [0x25, 0x50, 0x44, 0x46], ext: ".pdf", mime: "application/pdf" },
  { bytes: [0xff, 0xd8, 0xff], ext: ".jpg", mime: "image/jpeg" },
  { bytes: [0x89, 0x50, 0x4e, 0x47], ext: ".png", mime: "image/png" },
  { bytes: [0x47, 0x49, 0x46, 0x38], ext: ".gif", mime: "image/gif" },
  { bytes: [0x42, 0x4d], ext: ".bmp", mime: "image/bmp" },
  { bytes: [0x52, 0x41, 0x52, 0x21], ext: ".rar", mime: "application/vnd.rar" },
  { bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], ext: ".7z", mime: "application/x-7z-compressed" },
  { bytes: [0x50, 0x4b, 0x03, 0x04], ext: ".zip", mime: "application/zip" },
];

function sniff(buf: Buffer): FileMeta {
  if (buf.length >= 4 && buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00)
    return { ext: ".tiff", mime: "image/tiff" };
  if (buf.length >= 4 && buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x2a && buf[3] === 0x00)
    return { ext: ".tiff", mime: "image/tiff" };
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP")
    return { ext: ".webp", mime: "image/webp" };
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (/^(heic|heix|hevc|heim|heis)/.test(brand)) return { ext: ".heic", mime: "image/heic" };
    if (/^(mif1|msf1)/.test(brand)) return { ext: ".heif", mime: "image/heif" };
    if (brand.startsWith("avif")) return { ext: ".avif", mime: "image/avif" };
    if (/^(isom|mp41|mp42|M4V)/.test(brand)) return { ext: ".mp4", mime: "video/mp4" };
    return { ext: ".bin", mime: "application/octet-stream" };
  }
  for (const m of MAGIC) {
    if (buf.length >= m.bytes.length && m.bytes.every((b, i) => buf[i] === b)) {
      return { ext: m.ext, mime: m.mime };
    }
  }
  return { ext: ".bin", mime: "application/octet-stream" };
}

// ─── Sinkronisasi per-chunk ────────────────────

export async function runSyncChunk(limit: number, resetFailed: boolean): Promise<SyncResult> {
  if (resetFailed) {
    await prisma.document.updateMany({
      where: { legacyDriveUrl: { not: null }, storageKey: null, lastSyncError: { not: null } },
      data: { lastSyncError: null },
    });
  }

  const take = Math.max(0, Math.min(limit, 20));
  const failures: SyncResult["failures"] = [];
  let succeeded = 0;
  let processed = 0;

  if (take > 0) {
    const docs = await prisma.document.findMany({
      where: { legacyDriveUrl: { not: null }, storageKey: null, lastSyncError: null },
      orderBy: { createdAt: "asc" },
      take,
      include: { documentType: { select: { code: true } }, staff: { select: { name: true } } },
    });
    processed = docs.length;

    const queue = [...docs];
    const failuresLock: SyncResult["failures"] = [];
    async function worker() {
      for (;;) {
        const doc = queue.shift();
        if (!doc) break;
        try {
          const url = doc.legacyDriveUrl!;
          if (/\/folders\//.test(url)) throw new Error("Link folder, bukan file — tidak bisa diunduh otomatis");
          const fileId = doc.legacyDriveId ?? extractDriveId(url);
          if (!fileId) throw new Error("Link Drive tidak valid");
          const isGoogleDoc = /\/document\/d\//.test(url);
          const buf = await fetchDriveFile(fileId, isGoogleDoc);
          const meta = sniff(buf);
          // Store the downloaded binary through the storage layer (Cloudflare R2
          // in production, local disk in development). Neon keeps metadata only.
          const stored = await putObject({
            scope: "staff",
            ownerId: doc.staffId,
            category: doc.documentType.code.toLowerCase(),
            fileName: `${doc.documentType.code}${meta.ext}`,
            contentType: meta.mime,
            body: new Uint8Array(buf),
          });
          const notes =
            doc.notes && doc.notes.includes("menunggu sinkronisasi") ? null : doc.notes;
          await prisma.document.update({
            where: { id: doc.id },
            data: {
              storageKey: stored.storageKey,
              mimeType: meta.mime,
              fileSize: buf.length,
              filename: doc.filename ?? `${doc.documentType.code}${meta.ext}`,
              legacyDriveUrl: null,
              lastSyncError: null,
              notes,
            },
          });
          succeeded++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Gagal mengunduh file";
          await prisma.document
            .update({ where: { id: doc.id }, data: { lastSyncError: msg } })
            .catch(() => undefined);
          failuresLock.push({ id: doc.id, name: `${doc.staff.name} — ${doc.documentType.code}`, error: msg });
        }
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    failures.push(...failuresLock);
  }

  const status = await getSyncStatus();
  return { processed, succeeded, failed: failures.length, failures, status };
}
