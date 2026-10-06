import * as crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { googleFetch, type GoogleRole } from "@/lib/google/auth";
import { keySegments, type ObjectMetadata, type PutInput, type PutResult, type StorageProvider, type StoredObject } from "./provider";

/**
 * Google Drive storage provider (current production document store).
 *
 * Layout — a dedicated, private MYSIMNUSA folder tree in the connected account:
 *
 *   MYSIMNUSA/
 *   ├── staff/        (per-staff subfolders, per-category subfolders)
 *   ├── borang/
 *   ├── diklat/
 *   ├── certificates/
 *   └── migration/
 *
 * Folder ids are cached in the `DriveFolder` table (created lazily) so repeat
 * uploads never re-scan or duplicate folders. Files are uploaded with
 * `appProperties.mysimnusaKey`, which lets us resolve a storage key back to a
 * Drive file id without relying on folder names.
 *
 * Security: the bucket/folder is never shared publicly. Every read happens
 * server-side through application routes that enforce authentication + RBAC.
 */

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const ROOT_NAME = process.env.GOOGLE_DRIVE_ROOT_FOLDER?.trim() || "MYSIMNUSA";

/**
 * This provider is the production document store, so it is permanently bound to
 * the DESTINATION Google connection. The role is a hard-coded constant — it is
 * NOT configurable and NOT accepted from callers — so production files can never
 * be written into the legacy SOURCE account.
 */
const STORAGE_ROLE: GoogleRole = "DESTINATION";

/**
 * Google Drive limits `appProperties` to 124 bytes (key + value combined), so a
 * long storage key cannot be stored verbatim. We store a short, deterministic
 * token derived from the key and keep the full key in the file `description`
 * (much larger limit) for auditing.
 */
function keyToken(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 24);
}

type CachedFolder = { name: string; driveId: string };

// In-process cache so a warm serverless instance avoids repeated lookups.
const folderCache = new Map<string, string>();

function escapeQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function readFolderRow(path: string): Promise<string | null> {
  try {
    const row = await prisma.driveFolder.findUnique({ where: { path } });
    return row?.driveId ?? null;
  } catch {
    return null;
  }
}

async function writeFolderRow(path: string, name: string, driveId: string): Promise<void> {
  try {
    await prisma.driveFolder.upsert({
      where: { path },
      update: { driveId, name },
      create: { path, name, driveId },
    });
  } catch {
    // cache is best-effort; Drive lookups remain the source of truth
  }
}

async function findChildFolder(parentId: string | null, name: string): Promise<string | null> {
  const clauses = [`mimeType='${FOLDER_MIME}'`, `name='${escapeQuery(name)}'`, "trashed=false"];
  if (parentId) clauses.push(`'${parentId}' in parents`);
  const url = `${DRIVE_FILES}?q=${encodeURIComponent(clauses.join(" and "))}&fields=files(id,name)&pageSize=1&spaces=drive`;
  const res = await googleFetch(STORAGE_ROLE, url);
  if (!res.ok) return null;
  const json = (await res.json()) as { files?: { id: string }[] };
  return json.files?.[0]?.id ?? null;
}

async function createFolder(parentId: string | null, name: string): Promise<string> {
  const metadata: Record<string, unknown> = { name, mimeType: FOLDER_MIME };
  if (parentId) metadata.parents = [parentId];
  const res = await googleFetch(STORAGE_ROLE, DRIVE_FILES, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });
  if (!res.ok) {
    throw new Error(`[google-drive] gagal membuat folder "${name}" (HTTP ${res.status})`);
  }
  const json = (await res.json()) as { id: string };
  return json.id;
}

/** Resolves (creating when needed) the Drive folder for a logical path. */
async function resolveFolder(path: string, parentId: string | null): Promise<string> {
  const cached = folderCache.get(path);
  if (cached) {
    const checkRes = await googleFetch(STORAGE_ROLE, `${DRIVE_FILES}/${cached}?fields=id,trashed`).catch(() => null);
    if (checkRes?.ok) {
      const checkJson = (await checkRes.json().catch(() => null)) as { trashed?: boolean } | null;
      if (checkJson && !checkJson.trashed) return cached;
    }
    folderCache.delete(path);
  }

  const stored = await readFolderRow(path);
  if (stored) {
    const checkRes = await googleFetch(STORAGE_ROLE, `${DRIVE_FILES}/${stored}?fields=id,trashed`).catch(() => null);
    if (checkRes?.ok) {
      const checkJson = (await checkRes.json().catch(() => null)) as { trashed?: boolean } | null;
      if (checkJson && !checkJson.trashed) {
        folderCache.set(path, stored);
        return stored;
      }
    }
  }

  const name = keySegments(path).pop()!;
  const existing = await findChildFolder(parentId, name);
  const driveId = existing ?? (await createFolder(parentId, name));
  folderCache.set(path, driveId);
  await writeFolderRow(path, name, driveId);
  return driveId;
}

async function ensureFolderBySegments(segments: string[]): Promise<string> {
  let parentId: string | null = null;
  let path = "";
  for (const segment of [ROOT_NAME, ...segments]) {
    path = path ? `${path}/${segment}` : segment;
    parentId = await resolveFolder(path, parentId);
  }
  return parentId!;
}

function fileNameFromKey(key: string): string {
  return keySegments(key).pop() ?? "document";
}

async function toBlob(input: PutInput): Promise<Blob> {
  const { body } = input;
  if (body instanceof Blob) {
    return body.type || !input.contentType ? body : new Blob([body], { type: input.contentType });
  }
  const buffer = body instanceof ArrayBuffer ? body : (body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer);
  return new Blob([buffer], { type: input.contentType ?? "application/octet-stream" });
}

export class GoogleDriveStorage implements StorageProvider {
  readonly name = "google-drive" as const;

  /**
   * Considered configured when OAuth client credentials exist. The actual
   * account connection is verified on first use (a clear error is thrown if the
   * Migration Center Google connection is missing).
   */
  isConfigured(): boolean {
    return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
  }

  async put(input: PutInput): Promise<PutResult> {
    const segments = keySegments(input.key);
    const folderSegments = segments.slice(0, -1);
    const fileName = input.fileName?.trim() || fileNameFromKey(input.key);
    const parentId = await ensureFolderBySegments(folderSegments);
    const blob = await toBlob(input);

    const metadata = {
      name: fileName,
      parents: [parentId],
      // Short token keeps us inside Drive's 124-byte appProperties limit.
      appProperties: { mysimnusaKey: keyToken(input.key) },
      // Full key retained for auditing (description allows far more bytes).
      description: `MYSIMNUSA key: ${input.key}`,
    };

    // Multipart upload (metadata + bytes) in a single request.
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", blob, fileName);

    const res = await googleFetch(STORAGE_ROLE, `${DRIVE_UPLOAD}?uploadType=multipart&fields=id,name,size`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`[google-drive] unggah gagal (HTTP ${res.status}) ${detail.slice(0, 200)}`);
    }
    const json = (await res.json()) as { id: string; size?: string };
    return { key: input.key, providerId: json.id, bytes: blob.size };
  }

  /** Resolves a storage key to a Drive file id, falling back to a name search. */
  private async resolveFileId(key: string): Promise<string | null> {
    const byProperty = `${DRIVE_FILES}?q=${encodeURIComponent(
      `appProperties has { key='mysimnusaKey' and value='${keyToken(key)}' } and trashed=false`,
    )}&fields=files(id)&pageSize=1`;
    const res = await googleFetch(STORAGE_ROLE, byProperty);
    if (res.ok) {
      const json = (await res.json()) as { files?: { id: string }[] };
      if (json.files?.[0]?.id) return json.files[0].id;
    }

    // Fallback: exact description match (covers legacy/plain keys).
    const byDesc = `${DRIVE_FILES}?q=${encodeURIComponent(
      `description='MYSIMNUSA key: ${escapeQuery(key)}' and trashed=false`,
    )}&fields=files(id)&pageSize=1`;
    const res1 = await googleFetch(STORAGE_ROLE, byDesc);
    if (res1.ok) {
      const json1 = (await res1.json()) as { files?: { id: string }[] };
      if (json1.files?.[0]?.id) return json1.files[0].id;
    }

    // Fallback: newest non-trashed file with the same name (legacy records).
    const name = fileNameFromKey(key);
    const byName = `${DRIVE_FILES}?q=${encodeURIComponent(
      `name='${escapeQuery(name)}' and trashed=false`,
    )}&fields=files(id,createdTime)&orderBy=createdTime desc&pageSize=1`;
    const res2 = await googleFetch(STORAGE_ROLE, byName);
    if (!res2.ok) return null;
    const json2 = (await res2.json()) as { files?: { id: string }[] };
    return json2.files?.[0]?.id ?? null;
  }

  async get(key: string): Promise<StoredObject | null> {
    const fileId = await this.resolveFileId(key);
    if (!fileId) return null;

    const meta = await this.getMetadataByFileId(fileId);
    const res = await googleFetch(STORAGE_ROLE, `${DRIVE_FILES}/${fileId}?alt=media`);
    if (res.status === 404) return null;
    if (!res.ok || !res.body) {
      throw new Error(`[google-drive] unduh gagal (HTTP ${res.status})`);
    }
    return {
      body: res.body as ReadableStream<Uint8Array>,
      contentType: res.headers.get("content-type") ?? meta?.contentType,
      contentLength: meta?.size,
    };
  }

  /**
   * Small thumbnail for list/avatar rendering.
   *
   * Google Drive exposes a `thumbnailLink` (a small JPEG on Google's CDN, roughly
   * 10–40 KB regardless of the original size). We resolve it server-side and
   * stream those bytes, so the client downloads a lightweight image instead of
   * the multi-megabyte original, and the Drive URL is never exposed.
   */
  async getThumbnail(key: string, size = 256): Promise<StoredObject | null> {
    const fileId = await this.resolveFileId(key);
    if (!fileId) return null;

    const metaRes = await googleFetch(
      STORAGE_ROLE,
      `${DRIVE_FILES}/${fileId}?fields=thumbnailLink,thumbnailVersion,mimeType`,
    );
    if (!metaRes.ok) return null;
    const metaJson = (await metaRes.json().catch(() => null)) as
      | { thumbnailLink?: string; thumbnailVersion?: string; mimeType?: string }
      | null;
    const link = metaJson?.thumbnailLink;
    if (!link) return null;

    // The link carries a `=s<dim>` suffix that controls the rendered size.
    const sized = link.replace(/=s\d+(-c)?$/, `=s${size}`);
    const thumbRes = await googleFetch(STORAGE_ROLE, sized);
    if (thumbRes.status === 404) return null;
    if (!thumbRes.ok || !thumbRes.body) return null;

    const lengthHeader = thumbRes.headers.get("content-length");
    return {
      body: thumbRes.body as ReadableStream<Uint8Array>,
      contentType: thumbRes.headers.get("content-type") ?? metaJson?.mimeType ?? "image/jpeg",
      contentLength: lengthHeader ? Number(lengthHeader) : undefined,
    };
  }

  private async getMetadataByFileId(fileId: string): Promise<ObjectMetadata | null> {
    const res = await googleFetch(STORAGE_ROLE, `${DRIVE_FILES}/${fileId}?fields=id,name,size,mimeType,modifiedTime`);
    if (!res.ok) return null;
    const json = (await res.json()) as { id: string; name?: string; size?: string; mimeType?: string; modifiedTime?: string };
    return {
      key: fileId,
      providerId: json.id,
      size: json.size ? Number(json.size) : undefined,
      contentType: json.mimeType,
      modifiedAt: json.modifiedTime,
    };
  }

  async getMetadata(key: string): Promise<ObjectMetadata | null> {
    const fileId = await this.resolveFileId(key);
    if (!fileId) return null;
    const meta = await this.getMetadataByFileId(fileId);
    return meta ? { ...meta, key } : null;
  }

  async exists(key: string): Promise<boolean> {
    return (await this.resolveFileId(key)) !== null;
  }

  async remove(key: string): Promise<void> {
    const fileId = await this.resolveFileId(key);
    if (!fileId) return;
    const res = await googleFetch(STORAGE_ROLE, `${DRIVE_FILES}/${fileId}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      throw new Error(`[google-drive] hapus gagal (HTTP ${res.status})`);
    }
  }
}

export const googleDriveStorage = new GoogleDriveStorage();
export type { CachedFolder };
