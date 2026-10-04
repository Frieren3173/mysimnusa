import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon, PrismaNeonHTTP } from "@prisma/adapter-neon";

export type PrismaEnv = { DATABASE_URL?: string } | undefined;
type CtxLike = { waitUntil?: (p: Promise<unknown>) => void } | undefined;

type NeonWsAdapter = Awaited<ReturnType<PrismaNeon["connect"]>>;
type NeonHttpAdapter = Awaited<ReturnType<PrismaNeonHTTP["connect"]>>;

/** Per-request state: the WebSocket pool used only when a transaction starts. */
type Scope = { txPool?: Promise<NeonWsAdapter> };

const requestScope = new AsyncLocalStorage<Scope>();

// workerd always exposes the Cache Storage API, Node (vite/next build) does not.
const inWorkers = typeof caches !== "undefined";

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
    throw new Error("[prisma] DATABASE_URL is not available in the Worker env or process.env");
  }
  return url;
}

/**
 * Stateless adapter shared by every request.
 *
 * - Plain queries go over Neon's HTTP endpoint (`fetch()`), which workerd can
 *   reuse across requests and which costs a fraction of the CPU/connections of
 *   a WebSocket pool. This keeps per-request CPU low (the Worker's CPU budget
 *   is tiny) and avoids the "Cannot perform I/O on behalf of a different
 *   request" error entirely, because no I/O object outlives its request.
 * - Transactions cannot run over HTTP, so they open a WebSocket pool that is
 *   created lazily *inside the current request* (never reused across requests)
 *   and is torn down with the request context.
 */
class RequestScopedAdapter {
  readonly provider = "postgres" as const;
  readonly adapterName = "@prisma/adapter-neon";
  private readonly getUrl: () => string;
  private http?: Promise<NeonHttpAdapter>;
  private neon?: PrismaNeon;
  private nodeTxPool?: Promise<NeonWsAdapter>;

  constructor(getUrl: () => string) {
    this.getUrl = getUrl;
  }

  private wsFactory(): PrismaNeon {
    return (this.neon ??= new PrismaNeon({ connectionString: this.getUrl(), max: 5 }));
  }

  private httpAdapter(): Promise<NeonHttpAdapter> {
    return (this.http ??= new PrismaNeonHTTP(this.getUrl(), { arrayMode: true, fullResults: true }).connect());
  }

  private txPool(): Promise<NeonWsAdapter> {
    const scope = requestScope.getStore();
    if (scope) {
      scope.txPool ??= this.wsFactory().connect();
      return scope.txPool;
    }
    if (inWorkers) {
      throw new Error("[prisma] query executed outside withPrismaScope(); the Worker entry wrapper is missing");
    }
    this.nodeTxPool ??= this.wsFactory().connect();
    return this.nodeTxPool;
  }

  queryRaw(query: Parameters<NeonHttpAdapter["queryRaw"]>[0]) {
    return this.httpAdapter().then((adapter) => adapter.queryRaw(query));
  }

  executeRaw(query: Parameters<NeonHttpAdapter["executeRaw"]>[0]) {
    return this.httpAdapter().then((adapter) => adapter.executeRaw(query));
  }

  executeScript(script: string) {
    return this.httpAdapter().then((adapter) => adapter.executeScript(script));
  }

  startTransaction(isolationLevel?: Parameters<NeonWsAdapter["startTransaction"]>[0]) {
    return this.txPool().then((adapter) => adapter.startTransaction(isolationLevel));
  }

  getConnectionInfo(): ReturnType<NeonWsAdapter["getConnectionInfo"]> {
    return { supportsRelationJoins: true };
  }

  /** Nothing to release here: every I/O object belongs to the request that made it. */
  dispose(): Promise<void> {
    return Promise.resolve();
  }
}

class RequestScopedAdapterFactory {
  readonly provider = "postgres" as const;
  readonly adapterName = "@prisma/adapter-neon";
  private readonly adapter: RequestScopedAdapter;

  constructor(getUrl: () => string) {
    this.adapter = new RequestScopedAdapter(getUrl);
  }

  connect(): Promise<RequestScopedAdapter> {
    return Promise.resolve(this.adapter);
  }
}

// The client (and its WASM query engine) is created once per Worker isolate,
// during module evaluation, so that the engine startup CPU is charged to Worker
// startup instead of to a user request. The database URL itself is resolved
// lazily on the first query of each request, because it is only available there.
const client = new PrismaClient({
  adapter: new RequestScopedAdapterFactory(requireUrl),
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});

// Warming the engine here keeps the first real request cheap.
void client.$connect().catch(() => undefined);

function getClient(): PrismaClient {
  return client;
}

export async function withPrismaScope<T>(fn: () => Promise<T>, ctx?: CtxLike): Promise<T> {
  const scope: Scope = {};
  try {
    return await requestScope.run(scope, fn);
  } finally {
    // The Neon pool is created inside this request's I/O context, so workerd
    // tears the socket down when the request context ends. Explicitly ending it
    // here would only burn extra CPU inside `waitUntil`.
    void ctx;
  }
}

export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop) {
    try {
      const client = getClient();
      const value = Reflect.get(client, prop, client) as unknown;
      if (typeof value === "function") return (value as (...args: unknown[]) => unknown).bind(client);
      return value;
    } catch (error) {
      console.error("[prisma] Error accessing property:", String(prop), error);
      throw error;
    }
  },
});
