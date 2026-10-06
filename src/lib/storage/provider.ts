/**
 * Provider-agnostic object storage contract.
 *
 * MYSIMNUSA stores document *bytes* in an object store and keeps only
 * metadata in Neon PostgreSQL. The application-level document code
 * (`putObject` / `readObject` / `removeObject` / `objectExists`) never talks to
 * a specific backend directly, so the production provider can be switched
 * without touching routes, UI or business logic:
 *
 *   STORAGE_PROVIDER=google-drive   → Google Drive (current production)
 *   STORAGE_PROVIDER=r2             → Cloudflare R2   (future)
 *   STORAGE_PROVIDER=local          → local disk      (development)
 *
 * Adding a provider means implementing this interface and registering it in
 * `./index.ts` — nothing else in the codebase changes.
 */

export type PutInput = {
  /** Provider-agnostic key, e.g. `staff/<id>/str/<uuid>.pdf` */
  key: string;
  body: ArrayBuffer | Uint8Array | Blob;
  contentType?: string;
  /** Original file name, used when the provider needs one */
  fileName?: string;
};

export type PutResult = {
  /** Canonical key to persist in the database */
  key: string;
  /** Provider-specific identifier (Drive file id, R2 key, local path) */
  providerId?: string;
  bytes: number;
};

export type StoredObject = {
  body: ReadableStream<Uint8Array>;
  contentType?: string;
  contentLength?: number;
};

export type ObjectMetadata = {
  key: string;
  providerId?: string;
  size?: number;
  contentType?: string;
  modifiedAt?: string;
};

export interface StorageProvider {
  /** Stable identifier persisted with each document. */
  readonly name: "local" | "google-drive" | "r2";
  /** False when required credentials/configuration are missing. */
  isConfigured(): boolean;
  put(input: PutInput): Promise<PutResult>;
  get(key: string): Promise<StoredObject | null>;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getMetadata(key: string): Promise<ObjectMetadata | null>;
  /**
   * Optional small-image variant for list/avatar use (e.g. Drive's own
   * thumbnail). Providers that cannot produce one may omit this method; the
   * caller then falls back to `get()`.
   */
  getThumbnail?(key: string, size?: number): Promise<StoredObject | null>;
}

/** Splits a storage key into path segments, ignoring empty parts. */
export function keySegments(key: string): string[] {
  return key
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}
