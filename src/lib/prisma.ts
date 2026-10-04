import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

let sharedAdapter: PrismaMariaDb | null | undefined;

function getAdapter() {
  if (sharedAdapter !== undefined) return sharedAdapter;
  const url = process.env.DATABASE_URL;
  if (!url) { sharedAdapter = null; return null; }
  try {
    const u = new URL(url);
    if (u.protocol !== "mysql:" && u.protocol !== "mariadb:") { sharedAdapter = null; return null; }
    sharedAdapter = new PrismaMariaDb({
      host: u.hostname,
      port: u.port ? Number(u.port) : 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ""),
    });
    return sharedAdapter;
  } catch {
    sharedAdapter = null;
    return null;
  }
}

function createClient() {
  return new PrismaClient({
    adapter: getAdapter() ?? null,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

let globalClient: PrismaClient | undefined;

function getGlobalClient() {
  if (!globalClient) globalClient = createClient();
  return globalClient;
}

const requestScope = new AsyncLocalStorage<PrismaClient>();

export function withPrismaScope<T>(fn: () => T): T {
  const client = createClient();
  return requestScope.run(client, fn);
}

export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop) {
    const client = requestScope.getStore() ?? getGlobalClient();
    const value = Reflect.get(client, prop, client) as unknown;
    if (typeof value === "function") return (value as (...args: unknown[]) => unknown).bind(client);
    return value;
  },
});
