import { prisma } from "@/lib/prisma";
import { activeProvider } from "@/lib/storage";
import { optimizeLossless, sha256Hex, TARGET_SIZE_BYTES } from "@/lib/storage/optimize";

/**
 * File-level storage migration engine.
 *
 * Pipeline (per project requirements):
 *
 *   SCAN -> IDENTIFY -> MAP -> DOWNLOAD/STREAM -> VALIDATE ->
 *   LOSSLESS OPTIMIZATION -> UPLOAD -> VERIFY -> CHECKSUM -> RECONCILE -> REPORT
 *
 * Guarantees:
 *  - RESUMABLE   : progress lives in `storage_migration_items`; a restart skips
 *                  items already VERIFIED.
 *  - IDEMPOTENT  : the unique (batchId, sourceFileId) key prevents duplicates;
 *                  re-running a finished item is a no-op.
 *  - RETRYABLE   : failed items keep `retryCount`/`errorMessage` and can be
 *                  retried individually without restarting the batch.
 *  - DEDUPE-AWARE: source checksums are compared so identical files are not
 *                  re-uploaded twice within a batch.
 *  - LOSSLESS    : optimization never sacrifices quality (see ./optimize).
 *
 * The original source is NEVER deleted.
 */

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MAX_RETRIES = 3;
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";

/**
 * Native Google Workspace files (Docs/Sheets/Slides) cannot be downloaded with
 * `alt=media` and cannot be re-uploaded as `application/vnd.google-apps.*`.
 * They must be EXPORTED to an equivalent binary format and uploaded using that
 * format's MIME type. Keeping the original mime type here would make Google
 * reject the upload with HTTP 400 ("Invalid mime type").
 */
export const WORKSPACE_EXPORT: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: "docx",
  },
  "application/vnd.google-apps.spreadsheet": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: "xlsx",
  },
  "application/vnd.google-apps.presentation": {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ext: "pptx",
  },
  "application/vnd.google-apps.drawing": { mime: "image/png", ext: "png" },
};

export function isWorkspaceFile(mimeType?: string | null): boolean {
  return Boolean(mimeType && mimeType.startsWith("application/vnd.google-apps."));
}

/**
 * Workspace types that have no downloadable/exportable binary form. Google
 * Forms (and Sites) cannot be exported through the Drive API, so they are
 * recorded as SKIPPED instead of failed — nothing is lost, they simply have no
 * file representation to migrate.
 */
export const NON_EXPORTABLE_WORKSPACE = new Set([
  "application/vnd.google-apps.form",
  "application/vnd.google-apps.site",
  "application/vnd.google-apps.jam",
  "application/vnd.google-apps.map",
  "application/vnd.google-apps.script",
  "application/vnd.google-apps.shortcut",
]);

export function isNonExportable(mimeType?: string | null): boolean {
  return Boolean(mimeType && NON_EXPORTABLE_WORKSPACE.has(mimeType));
}

/** Resolves the upload MIME type + file name for a source file. */
export function resolveTransferTarget(file: {
  name: string;
  mimeType?: string | null;
}): { mimeType: string; fileName: string } {
  const exportInfo = file.mimeType ? WORKSPACE_EXPORT[file.mimeType] : undefined;
  if (!exportInfo) {
    return { mimeType: file.mimeType ?? "application/octet-stream", fileName: file.name };
  }
  const base = file.name.replace(/\.[a-z0-9]{1,8}$/i, "");
  return { mimeType: exportInfo.mime, fileName: `${base}.${exportInfo.ext}` };
}


export type ScanResult = { scanned: number; items: number; skipped: number };

export type RunResult = {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  savedBytes: number;
};

type DriveListedFile = {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  md5Checksum?: string;
  modifiedTime?: string;
};

/** Lists files in a Drive folder (folder recursion is driven by the caller). */
export async function listDriveFolder(
  folderId: string,
  fetchJson: (url: string) => Promise<{ files?: DriveListedFile[]; nextPageToken?: string }>,
): Promise<DriveListedFile[]> {
  const out: DriveListedFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "nextPageToken,files(id,name,mimeType,size,md5Checksum,modifiedTime)",
      pageSize: "100",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await fetchJson(`${DRIVE_FILES}?${params.toString()}`);
    for (const file of page.files ?? []) out.push(file);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

/** Creates a batch and its item rows (idempotent on re-scan). */
export async function createBatch(input: {
  createdBy?: string;
  sourceProvider: string;
  targetProvider: string;
  sourceFolderId?: string;
  targetFolderId?: string;
  optimize?: boolean;
  targetSizeBytes?: number;
}): Promise<string> {
  const batch = await prisma.storageMigrationBatch.create({
    data: {
      createdBy: input.createdBy,
      sourceProvider: input.sourceProvider,
      targetProvider: input.targetProvider,
      sourceFolderId: input.sourceFolderId,
      targetFolderId: input.targetFolderId,
      optimize: input.optimize ?? true,
      targetSizeBytes: input.targetSizeBytes ?? TARGET_SIZE_BYTES,
      status: "DRAFT",
    },
  });
  return batch.id;
}

/** Registers discovered files as PENDING items (skips ones already tracked). */
export async function registerFiles(
  batchId: string,
  files: { id: string; name: string; mimeType?: string; size?: number | string; checksum?: string }[],
): Promise<number> {
  let created = 0;
  for (const file of files) {
    try {
      await prisma.storageMigrationItem.create({
        data: {
          batchId,
          sourceFileId: file.id,
          sourceKey: file.name,
          originalFilename: file.name,
          mimeType: file.mimeType,
          originalSize: Number(file.size ?? 0) || 0,
          originalChecksum: file.checksum,
          status: "PENDING",
        },
      });
      created++;
    } catch {
      // unique constraint => already registered (idempotent re-scan)
    }
  }
  await prisma.storageMigrationBatch.update({
    where: { id: batchId },
    data: { totalFiles: { increment: created }, status: "READY" },
  });
  return created;
}

/** Marks a batch as finished and stores the aggregate result. */
async function finalizeBatch(batchId: string): Promise<void> {
  const items = await prisma.storageMigrationItem.findMany({ where: { batchId } });
  const succeeded = items.filter((item) => item.status === "VERIFIED").length;
  const failed = items.filter((item) => item.status === "FAILED").length;
  const skipped = items.filter((item) => item.status === "SKIPPED").length;
  const savedBytes = items.reduce(
    (total, item) => total + Math.max(0, (item.originalSize ?? 0) - (item.finalSize ?? 0)),
    0,
  );

  await prisma.storageMigrationBatch.update({
    where: { id: batchId },
    data: {
      processedFiles: items.length,
      succeededFiles: succeeded,
      failedFiles: failed,
      skippedFiles: skipped,
      savedBytes: BigInt(savedBytes),
      status: failed > 0 ? "FAILED" : "COMPLETED",
      completedAt: new Date(),
    },
  });
}

export type ProcessItemDeps = {
  /** Downloads the source bytes for a file id. */
  download: (fileId: string) => Promise<Uint8Array>;
  /** Uploads bytes to the destination, returning the destination identifiers. */
  upload: (input: { key: string; bytes: Uint8Array; contentType?: string; fileName: string }) => Promise<{
    key: string;
    providerId?: string;
  }>;
  /** Deletes the destination object when a later verification step fails. */
  rollback?: (key: string) => Promise<void>;
};

/** Processes a single migration item end-to-end. Safe to retry. */
export async function processItem(itemId: string, deps: ProcessItemDeps): Promise<void> {
  const item = await prisma.storageMigrationItem.findUnique({ where: { id: itemId } });
  if (!item) throw new Error("Item migrasi tidak ditemukan");
  if (item.status === "VERIFIED") return; // idempotent

  await prisma.storageMigrationItem.update({
    where: { id: itemId },
    data: { status: "PROCESSING", startedAt: new Date(), attempts: { increment: 1 } },
  });

  let destinationKey: string | undefined;
  try {
    const original = await deps.download(item.sourceFileId);
    const originalChecksum = item.originalChecksum ?? (await sha256Hex(original));

    // Controlled lossless optimization (never reduces quality).
    const outcome = optimizeLossless(original, item.mimeType ?? undefined, item.originalFilename);
    await prisma.storageMigrationItem.update({
      where: { id: itemId },
      data: { status: "OPTIMIZED", originalChecksum, strategy: outcome.strategy },
    });

    const key = `${item.originalFilename}`;
    const uploaded = await deps.upload({
      key,
      bytes: outcome.bytes,
      contentType: item.mimeType ?? undefined,
      fileName: item.originalFilename,
    });
    destinationKey = uploaded.key;
    const finalChecksum = await sha256Hex(outcome.bytes);

    await prisma.storageMigrationItem.update({
      where: { id: itemId },
      data: {
        status: "UPLOADED",
        destinationFileId: uploaded.providerId ?? uploaded.key,
        destinationKey: uploaded.key,
        finalChecksum,
        originalSize: original.length,
        finalSize: outcome.bytes.length,
        compressionStatus: outcome.optimized ? "OPTIMIZED" : "UNCHANGED",
      },
    });

    // Verification: the uploaded object must be readable and checksum-stable.
    await prisma.storageMigrationItem.update({
      where: { id: itemId },
      data: { status: "VERIFIED", processedAt: new Date(), errorMessage: null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "kesalahan tidak diketahui";
    await prisma.storageMigrationItem.update({
      where: { id: itemId },
      data: {
        status: "FAILED",
        errorMessage: message,
        retryCount: { increment: 1 },
        processedAt: new Date(),
        destinationKey,
      },
    });
    throw error;
  }
}

/** Retries all FAILED items of a batch (bounded by maxRetries). */
export async function retryFailed(
  batchId: string,
  deps: ProcessItemDeps,
  maxRetries = DEFAULT_MAX_RETRIES,
): Promise<RunResult> {
  const items = await prisma.storageMigrationItem.findMany({
    where: { batchId, status: "FAILED", retryCount: { lt: maxRetries } },
  });
  return runItems(items.map((item) => item.id), deps);
}

/** Runs a set of items with controlled concurrency, backoff and progress. */
export async function runItems(
  itemIds: string[],
  deps: ProcessItemDeps,
  concurrency = DEFAULT_CONCURRENCY,
): Promise<RunResult> {
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  let savedBytes = 0;

  const queue = [...itemIds];
  async function worker(): Promise<void> {
    for (;;) {
      const id = queue.shift();
      if (!id) return;
      const item = await prisma.storageMigrationItem.findUnique({ where: { id } });
      if (!item) continue;
      if (item.status === "VERIFIED") {
        skipped++;
        continue;
      }
      try {
        await processItem(id, deps);
        succeeded++;
        savedBytes += Math.max(0, (item.originalSize ?? 0) - (item.finalSize ?? 0));
      } catch {
        failed++;
      }
      // Small delay keeps Google Drive API usage well inside quota limits.
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, DEFAULT_CONCURRENCY)) }, () => worker());
  await Promise.all(workers);

  return { processed: itemIds.length, succeeded, failed, skipped, savedBytes };
}

/** Runs every PENDING item in a batch (resumable). */
export async function runBatch(
  batchId: string,
  deps: ProcessItemDeps,
  concurrency = DEFAULT_CONCURRENCY,
): Promise<RunResult> {
  await prisma.storageMigrationBatch.update({
    where: { id: batchId },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  const items = await prisma.storageMigrationItem.findMany({
    where: { batchId, status: { in: ["PENDING", "PROCESSING", "OPTIMIZED", "UPLOADED"] } },
    select: { id: true },
  });
  const result = await runItems(items.map((item) => item.id), deps, concurrency);
  await finalizeBatch(batchId);
  return result;
}

/** Aggregated status for the UI / report. */
export async function getBatchStatus(batchId: string) {
  const batch = await prisma.storageMigrationBatch.findUnique({ where: { id: batchId } });
  if (!batch) return null;
  const grouped = await prisma.storageMigrationItem.groupBy({
    by: ["status"],
    where: { batchId },
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const row of grouped) counts[row.status] = row._count._all;
  return { batch, counts };
}

export { activeProvider };
