import { randomUUID } from "crypto";
import {
  buildObjectKey,
  deleteObject,
  getObject,
  isR2Configured,
  uploadObject,
} from "./r2";

/**
 * Storage facade used by the application routes.
 *
 * - Production (Vercel): every object is stored in Cloudflare R2.
 * - Local development without R2 credentials: falls back to the on-disk
 *   `storage/` folder so the app keeps working offline.
 *
 * Postgres/Neon only ever holds metadata (`Document.storageKey`, `fileSize`,
 * `mimeType`, ...) — never the file bytes.
 *
 * NOTE: `fs`/`path` are imported lazily inside the local-disk helpers below so
 * that they are not traced into every serverless function bundle. Statically
 * importing them makes Next.js emit overly broad file-trace patterns and
 * inflates the number of Vercel Functions per deployment.
 */

export type StorageScope = "staff" | "borang" | "diklat" | "certificates";

export type PutObjectInput = {
  scope: StorageScope;
  ownerId: string;
  category?: string | null;
  /** Original file name (used to preserve the extension) */
  fileName: string;
  contentType?: string;
  body: ArrayBuffer | Uint8Array | Blob;
};

export type PutObjectResult = {
  /** Value stored in `Document.storageKey` */
  storageKey: string;
  /** Actual file name on disk / object name in R2 */
  objectName: string;
  bytes: number;
};

function extOf(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

function byteLength(body: ArrayBuffer | Uint8Array | Blob): number {
  if (body instanceof Blob) return body.size;
  return body.byteLength;
}

async function toArrayBuffer(body: ArrayBuffer | Uint8Array | Blob): Promise<ArrayBuffer> {
  if (body instanceof Blob) return body.arrayBuffer();
  if (body instanceof ArrayBuffer) return body;
  return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
}

/** Local-disk helpers — dynamically imported so `fs` stays out of prod bundles. */
async function localDisk() {
  const [{ promises: fs }, path] = await Promise.all([
    import("fs"),
    import("path"),
  ]);
  return { fs, path };
}

function localPathFor(storageKey: string, pathModule: { join: (...parts: string[]) => string }): string {
  return pathModule.join(process.cwd(), "storage", storageKey);
}

export async function putObject(input: PutObjectInput): Promise<PutObjectResult> {
  const objectName = `${randomUUID()}${extOf(input.fileName)}`;
  const key = buildObjectKey(input.scope, input.ownerId, input.category ?? null, objectName);

  if (isR2Configured()) {
    await uploadObject({ key, body: await toArrayBuffer(input.body), contentType: input.contentType });
    return { storageKey: key, objectName, bytes: byteLength(input.body) };
  }

  // Local-dev fallback: keep the historical `storage/documents/...` layout.
  const { fs, path } = await localDisk();
  const legacyDir = path.join(process.cwd(), "storage", "documents", input.ownerId);
  await fs.mkdir(legacyDir, { recursive: true });
  const buffer = Buffer.from(await toArrayBuffer(input.body));
  await fs.writeFile(path.join(legacyDir, objectName), buffer);

  return {
    storageKey: `documents/${input.ownerId}/${objectName}`,
    objectName,
    bytes: buffer.byteLength,
  };
}

export type StoredObject = {
  body: ReadableStream<Uint8Array>;
  contentType?: string;
  contentLength?: number;
};

export async function readObject(storageKey: string): Promise<StoredObject | null> {
  if (isR2Configured()) {
    const object = await getObject(storageKey);
    if (!object) return null;
    return object;
  }

  const { fs, path } = await localDisk();
  const filePath = localPathFor(storageKey, path);
  try {
    await fs.access(filePath);
  } catch {
    return null;
  }
  const buffer = await fs.readFile(filePath);
  return {
    body: new Blob([new Uint8Array(buffer)]).stream(),
    contentType: undefined,
    contentLength: buffer.byteLength,
  };
}

export async function removeObject(storageKey: string): Promise<void> {
  if (isR2Configured()) {
    await deleteObject(storageKey);
    return;
  }

  const { fs, path } = await localDisk();
  const filePath = localPathFor(storageKey, path);
  try {
    await fs.unlink(filePath);
  } catch {
    // already gone
  }
}

export { isR2Configured };
