import { AwsClient } from "aws4fetch";

/**
 * Cloudflare R2 object storage (S3-compatible).
 *
 * Final architecture:
 *   - Neon PostgreSQL : structured data + document metadata (e.g. `Document` rows)
 *   - Cloudflare R2   : the actual files/documents
 *
 * Files are streamed straight to R2 from the server route that receives the
 * upload, so nothing large is kept in Postgres and object keys are never
 * exposed to the browser without going through application authorization.
 *
 * When R2 is not configured the caller falls back to local disk storage
 * (development convenience only — Vercel's filesystem is ephemeral).
 */

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl?: string;
};

function readConfig(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL?.trim() || undefined,
  };
}

export function isR2Configured(): boolean {
  return readConfig() !== null;
}

function endpoint(config: R2Config, key: string): string {
  const safeKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${safeKey}`;
}

function client(config: R2Config): AwsClient {
  return new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });
}

export type UploadInput = {
  key: string;
  body: ArrayBuffer | Uint8Array | Blob;
  contentType?: string;
};

export async function uploadObject(input: UploadInput): Promise<{ key: string }> {
  const config = readConfig();
  if (!config) throw new Error("[r2] storage is not configured");

  const response = await client(config).fetch(endpoint(config, input.key), {
    method: "PUT",
    headers: {
      "Content-Type": input.contentType ?? "application/octet-stream",
    },
    body: input.body as BodyInit,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`[r2] upload failed (${response.status}) ${detail.slice(0, 200)}`);
  }

  return { key: input.key };
}

export async function getObject(key: string): Promise<{ body: ReadableStream<Uint8Array>; contentType?: string; contentLength?: number } | null> {
  const config = readConfig();
  if (!config) throw new Error("[r2] storage is not configured");

  const response = await client(config).fetch(endpoint(config, key), { method: "GET" });
  if (response.status === 404) return null;
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`[r2] download failed (${response.status}) ${detail.slice(0, 200)}`);
  }
  if (!response.body) return null;

  const length = response.headers.get("content-length");
  return {
    body: response.body as ReadableStream<Uint8Array>,
    contentType: response.headers.get("content-type") ?? undefined,
    contentLength: length ? Number(length) : undefined,
  };
}

export async function deleteObject(key: string): Promise<void> {
  const config = readConfig();
  if (!config) throw new Error("[r2] storage is not configured");

  const response = await client(config).fetch(endpoint(config, key), { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    const detail = await response.text().catch(() => "");
    throw new Error(`[r2] delete failed (${response.status}) ${detail.slice(0, 200)}`);
  }
}

export async function objectExists(key: string): Promise<boolean> {
  const config = readConfig();
  if (!config) throw new Error("[r2] storage is not configured");

  const response = await client(config).fetch(endpoint(config, key), { method: "HEAD" });
  return response.ok;
}

/**
 * Builds a predictable object key, e.g.
 *   staff/{staffId}/str/{generated-file-name}
 *   borang/{recordId}/{generated-file-name}
 *   diklat/{trainingId}/{generated-file-name}
 *   certificates/{certificateId}/{generated-file-name}
 */
export function buildObjectKey(scope: string, ownerId: string, category: string | null, fileName: string): string {
  const segments = [scope, ownerId];
  if (category) segments.push(category);
  segments.push(fileName);
  return segments
    .filter((segment) => segment && segment.length > 0)
    .map((segment) => segment.replace(/^\/+|\/+$/g, ""))
    .join("/");
}
