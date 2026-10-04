import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { extractDriveId } from "./source";

// ─── Status ────────────────────────────────────

export interface SyncStatus {
  total: number;
  migrated: number;
  pending: number;
  ready: number;
  failed: number;
  percent: number;
  duplicates: number;
}

export interface SyncResult {
  processed: number;
  succeeded: number;
  failed: number;
  failures: { id: string; name: string; error: string }[];
  status: SyncStatus;
}

/** Grup duplikat + baris yang TIDAK dipertahankan (akan dihapus). */
async function computeDuplicates(): Promise<{ remove: Set<string>; groups: number }> {
  const docs = await prisma.document.findMany({
    select: { id: true, staffId: true, documentTypeId: true, legacyDriveId: true, storageKey: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const byPair = new Map<string, typeof docs>();
  const byDrive = new Map<string, typeof docs>();
  for (const d of docs) {
    const pairKey = `${d.staffId}|${d.documentTypeId}`;
    const arr = byPair.get(pairKey);
    if (arr) arr.push(d);
    else byPair.set(pairKey, [d]);
    if (d.legacyDriveId) {
      const arr2 = byDrive.get(d.legacyDriveId);
      if (arr2) arr2.push(d);
      else byDrive.set(d.legacyDriveId, [d]);
    }
  }
  const remove = new Set<string>();
  let groups = 0;
  const keepBest = (g: typeof docs) => {
    groups++;
    const sorted = [...g].sort(
      (a, b) =>
        Number(!!b.storageKey) - Number(!!a.storageKey) ||
        a.createdAt.getTime() - b.createdAt.getTime()
    );
    for (const d of sorted.slice(1)) remove.add(d.id);
  };
  for (const g of byPair.values()) if (g.length > 1) keepBest(g);
  for (const g of byDrive.values()) if (g.length > 1) keepBest(g);
  return { remove, groups };
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const [migrated, pending, failed, dup] = await Promise.all([
    prisma.document.count({ where: { storageKey: { not: null } } }),
    prisma.document.count({ where: { legacyDriveUrl: { not: null }, storageKey: null } }),
    prisma.document.count({
      where: { legacyDriveUrl: { not: null }, storageKey: null, lastSyncError: { not: null } },
    }),
    computeDuplicates(),
  ]);
  const total = migrated + pending;
  return {
    total,
    migrated,
    pending,
    failed,
    ready: pending - failed,
    percent: total === 0 ? 100 : Math.round((migrated * 100) / total),
    duplicates: dup.groups,
  };
}

export async function dedupDocuments(): Promise<{ removed: number; groups: number }> {
  const { remove, groups } = await computeDuplicates();
  if (remove.size > 0) {
    await prisma.document.deleteMany({ where: { id: { in: [...remove] } } });
  }
  return { removed: remove.size, groups };
}

// ─── Download dari Google Drive (link publik) ──

function looksHtml(buf: Buffer): boolean {
  const head = buf.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<head");
}

async function fetchDriveFile(fileId: string, isGoogleDoc: boolean): Promise<Buffer> {
  const urls = isGoogleDoc
    ? [`https://docs.google.com/document/d/${fileId}/export?format=pdf`]
    : [
        `https://drive.google.com/uc?export=download&id=${fileId}`,
        `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
      ];
  let lastErr = "File tidak dapat diambil dari Google Drive";
  for (const url of urls) {
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(45000),
        headers: { "User-Agent": "RSJAT-Nursing-Management/1.0" },
      });
    } catch (e) {
      lastErr =
        e instanceof Error && e.name === "TimeoutError"
          ? "Timeout saat mengunduh file (45s)"
          : "Gagal terhubung ke Google Drive";
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok) {
      lastErr =
        res.status === 404
          ? "File tidak ditemukan di Drive (404)"
          : res.status === 403
            ? "Akses ditolak (403) — ubah akses file menjadi publik"
            : `Drive merespons HTTP ${res.status}`;
      continue;
    }
    if (buf.length === 0) {
      lastErr = "File kosong dari Drive";
      continue;
    }
    if (looksHtml(buf)) {
      lastErr =
        "Drive mengembalikan halaman, bukan file — pastikan akses \"Siapa saja yang memiliki link\" aktif";
      continue;
    }
    return buf;
  }
  throw new Error(lastErr);
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
          const dir = path.join(process.cwd(), "storage", "documents", doc.staffId);
          fs.mkdirSync(dir, { recursive: true });
          const filename = `${randomUUID()}${meta.ext}`;
          fs.writeFileSync(path.join(dir, filename), buf);
          const notes =
            doc.notes && doc.notes.includes("menunggu sinkronisasi") ? null : doc.notes;
          await prisma.document.update({
            where: { id: doc.id },
            data: {
              storageKey: `documents/${doc.staffId}/${filename}`,
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
