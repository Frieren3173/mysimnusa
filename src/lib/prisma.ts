import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

/**
 * Prisma client for the MYSIMNUSA production runtime (Vercel / Node.js).
 *
 * Design notes:
 *  - A single PrismaClient is created per serverless instance and reused for
 *    every request handled by that instance. The WASM query engine is therefore
 *    instantiated once, not per request.
 *  - The Neon driver adapter keeps a pooled WebSocket connection to Neon. In the
 *    Node.js runtime this pool is safe to reuse across requests, which removes
 *    the per-query HTTPS round-trip that the previous HTTP-endpoint adapter
 *    incurred (that adapter existed only for the Cloudflare Workers runtime,
 *    which is no longer used).
 *  - The connection string is resolved lazily so the client can be constructed
 *    during module evaluation (server startup) before env is guaranteed set.
 *  - `withPrismaScope` is kept as a no-op wrapper for call-site compatibility.
 *
 * Postgres/Neon only ever holds metadata and structured data; document bytes
 * live in Google Drive.
 */

export type PrismaEnv = { DATABASE_URL?: string } | undefined;
type CtxLike = { waitUntil?: (p: Promise<unknown>) => void } | undefined;

let globalEnv: PrismaEnv;

export function setPrismaEnv(env: PrismaEnv) {
  globalEnv = env;
}

function resolveUrl(): string | undefined {
  return globalEnv?.DATABASE_URL || process.env.DATABASE_URL;
}

function requireUrl(): string {
  const url = resolveUrl();
  if (!url) {
    throw new Error("[prisma] DATABASE_URL is not available in the environment");
  }
  return url;
}

type NeonAdapter = Awaited<ReturnType<PrismaNeon["connect"]>>;

/**
 * Adapter that defers creating the Neon pool until the first query, so the
 * connection string is read from the environment at the right time while the
 * pool itself is reused for the lifetime of the instance.
 */
class LazyNeonAdapter {
  readonly provider = "postgres" as const;
  readonly adapterName = "@prisma/adapter-neon";
  private readonly getUrl: () => string;
  private pool?: Promise<NeonAdapter>;

  constructor(getUrl: () => string) {
    this.getUrl = getUrl;
  }

  private adapter(): Promise<NeonAdapter> {
    // max: 5 keeps well inside Neon's connection limits while allowing the small
    // amount of parallelism a request may use.
    return (this.pool ??= new PrismaNeon({ connectionString: this.getUrl(), max: 5 }).connect());
  }

  queryRaw(query: Parameters<NeonAdapter["queryRaw"]>[0]) {
    return this.adapter().then((a) => a.queryRaw(query));
  }

  executeRaw(query: Parameters<NeonAdapter["executeRaw"]>[0]) {
    return this.adapter().then((a) => a.executeRaw(query));
  }

  executeScript(script: string) {
    return this.adapter().then((a) => a.executeScript(script));
  }

  startTransaction(isolationLevel?: Parameters<NeonAdapter["startTransaction"]>[0]) {
    return this.adapter().then((a) => a.startTransaction(isolationLevel));
  }

  getConnectionInfo(): ReturnType<NeonAdapter["getConnectionInfo"]> {
    return { supportsRelationJoins: true };
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }
}

class LazyNeonAdapterFactory {
  readonly provider = "postgres" as const;
  readonly adapterName = "@prisma/adapter-neon";
  private readonly adapter: LazyNeonAdapter;

  constructor(getUrl: () => string) {
    this.adapter = new LazyNeonAdapter(getUrl);
  }

  connect(): Promise<LazyNeonAdapter> {
    return Promise.resolve(this.adapter);
  }
}

// Reuse a single client across hot reloads / module re-evaluation in dev and
// across the instance lifetime in production.
const globalForPrisma = globalThis as unknown as { __mysimnusaPrisma?: PrismaClient };

const client =
  globalForPrisma.__mysimnusaPrisma ??
  new PrismaClient({
    adapter: new LazyNeonAdapterFactory(requireUrl),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__mysimnusaPrisma = client;
}

/** Kept for call-site compatibility; request scoping is no longer required. */
export async function withPrismaScope<T>(fn: () => Promise<T>, ctx?: CtxLike): Promise<T> {
  void ctx;
  return fn();
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const value = Reflect.get(client, prop, client) as unknown;
    if (typeof value === "function") return (value as (...args: unknown[]) => unknown).bind(client);
    return value;
  },
});
