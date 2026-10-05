import { randomUUID } from "crypto";
import { buildObjectKey } from "./r2";
import { googleDriveStorage } from "./google-drive";
import { isR2Configured } from "./r2";
import type { StorageProvider } from "./provider";

/**
 * Storage facade used by the application routes.
 *
 * The active backend is chosen by `STORAGE_PROVIDER`:
 *
 *   google-drive → Google Drive  (current production document storage)
 *   r2           → Cloudflare R2 (future provider, kept fully supported)
 *   local        → on-disk `storage/` folder (development)
 *
 * When `STORAGE_PROVIDER` is unset the provider is auto-detected so existing
 * environments keep working: Drive when Google is configured, otherwise R2,
 * otherwise local disk.
 *
 * Routes only ever call `putObject` / `readObject` / `removeObject`; switching
 * providers requires no changes to document, Borang or Diklat logic.
 *
 * Neon only ever holds metadata (`Document.storageKey`, `fileSize`,
 * `mimeType`, ...) — never the file bytes.
 */

export type StorageScope = "staff" | "borang" | "diklat" | "certificates" | "migration";

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
  /** Actual file name on disk / object name in R2 / Drive file name */
  objectName: string;
  bytes: number;
  /** Provider-specific identifier (Drive file id, R2 key, local path) */
  providerId?: string;
  /** Provider that stored the object */
  provider: StorageProvider["name"];
};

export type StoredObject = {
  body: ReadableStream<Uint8Array>;
  contentType?: string;
  contentLength?: number;
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
  const [{ promises: fs }, path] = await Promise.all([import("fs"), import("path")]);
  return { fs, path };
}

const localProvider: StorageProvider = {
  name: "local",
  isConfigured: () => true,
  async put(input) {
    const { fs, path } = await localDisk();
    const segments = input.key.split("/");
    const objectName = segments.pop()!;
    const dir = path.join(process.cwd(), "storage", ...segments);
    await fs.mkdir(dir, { recursive: true });
    const buffer = Buffer.from(await toArrayBuffer(input.body));
    await fs.writeFile(path.join(dir, objectName), buffer);
    return { key: input.key, bytes: buffer.byteLength };
  },
  async get(key) {
    const { fs, path } = await localDisk();
    const filePath = path.join(process.cwd(), "storage", key);
    try {
      await fs.access(filePath);
    } catch {
      return null;
    }
    const buffer = await fs.readFile(filePath);
    return {
      body: new Blob([new Uint8Array(buffer)]).stream(),
      contentLength: buffer.byteLength,
    };
  },
  async remove(key) {
    const { fs, path } = await localDisk();
    try {
      await fs.unlink(path.join(process.cwd(), "storage", key));
    } catch {
      // already gone
    }
  },
  async exists(key) {
    const { fs, path } = await localDisk();
    try {
      await fs.access(path.join(process.cwd(), "storage", key));
      return true;
    } catch {
      return false;
    }
  },
  async getMetadata(key) {
    const { fs, path } = await localDisk();
    try {
      const stat = await fs.stat(path.join(process.cwd(), "storage", key));
      return { key, size: stat.size, modifiedAt: stat.mtime.toISOString() };
    } catch {
      return null;
    }
  },
};

/** Legacy R2 helpers live in `./r2`; wrapped here behind the provider contract. */
function r2Provider(): StorageProvider {
  const legacyKey = (key: string) => key.replace(/^documents\//, "");
  return {
    name: "r2",
    isConfigured: isR2Configured,
    async put(input) {
      const { uploadObject } = await import("./r2");
      const key = legacyKey(input.key);
      await uploadObject({ key, body: await toArrayBuffer(input.body), contentType: input.contentType });
      return { key, bytes: byteLength(input.body), providerId: key };
    },
    async get(key) {
      const { getObject } = await import("./r2");
      return getObject(legacyKey(key));
    },
    async remove(key) {
      const { deleteObject } = await import("./r2");
      await deleteObject(legacyKey(key));
    },
    async exists(key) {
      const { objectExists } = await import("./r2");
      return objectExists(legacyKey(key));
    },
    async getMetadata(key) {
      const { objectExists } = await import("./r2");
      return (await objectExists(legacyKey(key))) ? { key } : null;
    },
  };
}

/** Chooses the active provider from configuration. */
export function activeProvider(): StorageProvider {
  const configured = process.env.STORAGE_PROVIDER?.trim().toLowerCase();
  if (configured === "r2") return r2Provider();
  if (configured === "local") return localProvider;
  if (configured === "google-drive") return googleDriveStorage;

  // Auto-detect: prefer Google Drive (production), then R2, then local disk.
  if (googleDriveStorage.isConfigured()) return googleDriveStorage;
  if (isR2Configured()) return r2Provider();
  return localProvider;
}

export async function putObject(input: PutObjectInput): Promise<PutObjectResult> {
  const provider = activeProvider();
  const objectName = `${randomUUID()}${extOf(input.fileName)}`;
  const key = buildObjectKey(input.scope, input.ownerId, input.category ?? null, objectName);

  const result = await provider.put({
    key,
    body: input.body,
    contentType: input.contentType,
    fileName: input.fileName,
  });

  return {
    storageKey: result.key,
    objectName,
    bytes: result.bytes,
    providerId: result.providerId,
    provider: provider.name,
  };
}

export async function readObject(storageKey: string): Promise<StoredObject | null> {
  return activeProvider().get(storageKey);
}

export async function removeObject(storageKey: string): Promise<void> {
  await activeProvider().remove(storageKey);
}

export async function objectExists(storageKey: string): Promise<boolean> {
  return activeProvider().exists(storageKey);
}

export { isR2Configured };
export type { StorageProvider };
