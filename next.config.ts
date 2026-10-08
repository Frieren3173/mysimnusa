import type { NextConfig } from "next";

/**
 * Content-Security-Policy.
 *
 * Default mode is **report-only** (never blocks), so the app keeps working while
 * the browser reports violations. Set `CSP_MODE=enforce` to switch the same
 * policy to the blocking `Content-Security-Policy` header once reports are clean
 * (see README → "CSP hardening"). The policy content is identical either way.
 *
 * The policy is derived from what the app actually loads:
 *   • media  — background videos under /assets (mp4/webm), same origin
 *   • img    — same origin, WebP/JPG/PNG posters, blob:/data: previews
 *   • font   — Inter via next/font (self-hosted, same origin)
 *   • script/style — Next.js inline bootstrap (needs 'unsafe-inline' until a
 *     nonce is wired through; report-only means this is observation, not a gate)
 *   • connect — same origin (Google OAuth / Drive calls happen server-side)
 *   • report-uri — violations are posted to /api/csp-report (no auth, no DB)
 */
const cspPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "media-src 'self'",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "report-uri /api/csp-report",
].join("; ");

const isProd = process.env.NODE_ENV === "production";

// `report-only` (default) keeps the report-only header; `enforce` blocks.
const cspMode = (process.env.CSP_MODE ?? "report-only").trim().toLowerCase();
const cspHeaderName =
  cspMode === "enforce"
    ? "Content-Security-Policy"
    : "Content-Security-Policy-Report-Only";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "magnetometer=()",
      "gyroscope=()",
      "accelerometer=()",
      "fullscreen=(self)",
    ].join(", "),
  },
  // Only meaningful over HTTPS; sent in production only.
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
  // Report-only by default; blocking when CSP_MODE=enforce.
  { key: cspHeaderName, value: cspPolicy },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "rsjat-nursing-management.test",
    "*.rsjat-nursing-management.test",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
