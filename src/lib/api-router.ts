import { NextRequest } from "next/server";

/**
 * Utility for consolidating many App Router route handlers into a single
 * catch-all handler per API group.
 *
 * Why this exists: Vercel's Hobby plan allows at most 12 Serverless Functions
 * per deployment, and Next.js creates one function per dynamic route segment.
 * MYSIMNUSA has 51 API route handlers, so each group (admin, auth, borang,
 * diklat, documents, komite) is served by one catch-all handler that delegates
 * to the original, unchanged handler functions.
 *
 * URL paths, methods, status codes and payloads are identical to the previous
 * per-route layout — only the physical function layout changes.
 */

export type RouteParams = Record<string, string>;

/** A route handler as written in the app (all existing handlers match this). */
export type AppRouteHandler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response> | Response;

/**
 * Route modules may declare handlers with narrower param types
 * (e.g. `{ params: Promise<{ id: string }> }`), so the table accepts any
 * module shape and the dispatcher passes the parsed params through.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RouteModule = Record<string, any>;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type RouteEntry = {
  /**
   * Pattern segments relative to the group root, e.g. ["staff", ":id", "documents"].
   * `:name` matches exactly one segment; `*name` matches the rest.
   */
  pattern: string[];
  module: RouteModule;
};

export type RouteMatch = {
  module: RouteModule;
  params: RouteParams;
};

/**
 * Matches a request path against the route table.
 *
 * Like Next.js, literal segments take precedence over dynamic ones, so
 * `/admin/migration/status` resolves to the `status` route rather than to
 * `:batchId`. Routes are scored and the most specific match wins.
 */
export function matchRoute(entries: RouteEntry[], segments: string[]): RouteMatch | null {
  let best: { match: RouteMatch; score: number } | null = null;
  for (const entry of entries) {
    const params = matchPattern(entry.pattern, segments);
    if (!params) continue;
    const score = specificity(entry.pattern);
    if (!best || score > best.score) {
      best = { match: { module: entry.module, params }, score };
    }
  }
  return best ? best.match : null;
}

/** Higher score = more literal segments = more specific. */
function specificity(pattern: string[]): number {
  return pattern.reduce((score, part) => (part.startsWith(":") || part.startsWith("*") ? score : score + 1), 0);
}

function matchPattern(pattern: string[], segments: string[]): RouteParams | null {
  const params: RouteParams = {};
  for (let i = 0; i < pattern.length; i++) {
    const part = pattern[i];
    if (part.startsWith(":")) {
      const value = segments[i];
      if (value === undefined) return null;
      params[part.slice(1)] = decodeURIComponent(value);
      continue;
    }
    if (part.startsWith("*")) {
      params[part.slice(1)] = segments.slice(i).map(decodeURIComponent).join("/");
      return params;
    }
    if (part !== segments[i]) return null;
  }
  return pattern.length === segments.length ? params : null;
}

function notFound(): Response {
  return new Response(JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "Endpoint tidak ditemukan" } }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

function methodNotAllowed(allowed: HttpMethod[]): Response {
  return new Response(
    JSON.stringify({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Metode tidak didukung" } }),
    { status: 405, headers: { "Content-Type": "application/json", Allow: allowed.join(", ") } },
  );
}

/**
 * Creates the `GET`/`POST`/... exports for a catch-all route from a route table.
 */
export function createGroupHandler(
  baseSegments: string[],
  entries: RouteEntry[],
): Record<HttpMethod, (req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) => Promise<Response>> {
  async function dispatch(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }): Promise<Response> {
    const { path = [] } = await ctx.params;
    const segments = [...baseSegments, ...path];
    const match = matchRoute(entries, segments);
    if (!match) return notFound();

    const routeModule = match.module;
    const method = req.method.toUpperCase() as HttpMethod;
    const handler = routeModule[method] as AppRouteHandler | undefined;
    if (!handler) {
      const allowed = Object.keys(routeModule).filter((key) => /^[A-Z]+$/.test(key)) as HttpMethod[];
      return methodNotAllowed(allowed);
    }

    return handler(req, { params: Promise.resolve(match.params) });
  }

  return {
    GET: dispatch,
    POST: dispatch,
    PUT: dispatch,
    PATCH: dispatch,
    DELETE: dispatch,
    HEAD: dispatch,
    OPTIONS: dispatch,
  };
}
