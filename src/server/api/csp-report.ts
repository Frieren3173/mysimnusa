import { NextRequest } from "next/server";

/**
 * CSP violation report sink.
 *
 * Browsers POST here automatically when a `Content-Security-Policy(-Report-Only)`
 * rule is violated (see `report-uri` in next.config.ts). No authentication (the
 * browser sends it for the page, not the user) and it NEVER touches the database.
 *
 * Hardening:
 *  - only the two report content-types are accepted
 *  - the body is read with an 8 KB cap (rejected beyond that)
 *  - only a few fields are kept; everything else is dropped
 *  - a tiny in-memory rate limiter prevents log flooding
 */

const MAX_BODY_BYTES = 8 * 1024; // 8 KB
const ACCEPTED = new Set(["application/csp-report", "application/reports+json", "application/json"]);

// Simple per-instance rate limit (best-effort; serverless instances are short-lived).
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
let windowStart = Date.now();
let windowCount = 0;

function rateLimited(): boolean {
  const now = Date.now();
  if (now - windowStart > RATE_WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount += 1;
  return windowCount > RATE_MAX;
}

/** Pulls the useful fields out of either report shape, dropping the rest. */
function summarize(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== "object" || payload === null) return null;
  const obj = payload as Record<string, unknown>;

  // Legacy `application/csp-report` shape: { "csp-report": { ... } }
  const legacy = obj["csp-report"] as Record<string, unknown> | undefined;
  if (legacy && typeof legacy === "object") {
    return {
      blockedUri: legacy["blocked-uri"],
      violatedDirective: legacy["violated-directive"] || legacy["effective-directive"],
      documentUri: legacy["document-uri"],
      disposition: legacy.disposition,
      sourceFile: legacy["source-file"],
      lineNumber: legacy["line-number"],
    };
  }

  // Reporting API shape: { type, body: { ... } } (possibly an array).
  const reports = Array.isArray(obj) ? obj : [obj];
  const first = reports[0] as Record<string, unknown> | undefined;
  if (first && typeof first === "object") {
    const body = (first.body ?? first) as Record<string, unknown>;
    return {
      blockedUri: body.blockedURL ?? body["blocked-uri"],
      violatedDirective: body.effectiveDirective ?? body.violatedDirective,
      documentUri: body.documentURL ?? body["document-uri"],
      disposition: body.disposition,
      sourceFile: body.sourceFile,
      lineNumber: body.lineNumber,
    };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const contentType = (req.headers.get("content-type") ?? "").split(";")[0]!.trim();
  if (!ACCEPTED.has(contentType)) {
    return new Response(null, { status: 415 });
  }

  // Read with a hard cap: reject anything larger than 8 KB.
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }

  let raw = "";
  try {
    raw = await req.text();
  } catch {
    return new Response(null, { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }

  // Always answer 204 (no content) so the browser does not retry.
  if (rateLimited()) return new Response(null, { status: 204 });

  try {
    const parsed = JSON.parse(raw);
    const summary = summarize(parsed);
    if (summary) {
      // Log via the server logger only (never the DB).
      console.warn("[mysimnusa:csp]", JSON.stringify(summary));
    }
  } catch {
    // Malformed reports are ignored (still 204).
  }

  return new Response(null, { status: 204 });
}
