import * as fs from "fs";
import * as path from "path";
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
  const ext = path.extname(fileName).toLowerCase();
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

export async function putObject(input: PutObjectInput): Promise<PutObjectResult> {
  const objectName = `${randomUUID()}${extOf(input.fileName)}`;
  const key = buildObjectKey(input.scope, input.ownerId, input.category ?? null, objectName);

  if (isR2Configured()) {
    await uploadObject({ key, body: await toArrayBuffer(input.body), contentType: input.contentType });
    return { storageKey: key, objectName, bytes: byteLength(input.body) };
  }

  // Local-dev fallback: keep the historical `storage/documents/...` layout.
  const legacyDir = path.join(process.cwd(), "storage", "documents", input.ownerId);
  fs.mkdirSync(legacyDir, { recursive: true });
  const buffer = Buffer.from(await toArrayBuffer(input.body));
  fs.writeFileSync(path.join(legacyDir, objectName), buffer);

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

  const filePath = path.join(process.cwd(), "storage", storageKey);
  if (!fs.existsSync(filePath)) return null;
  const buffer = fs.readFileSync(filePath);
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

  const filePath = path.join(process.cwd(), "storage", storageKey);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export { isR2Configured };
