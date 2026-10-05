import * as crypto from "crypto";
import { prisma } from "@/lib/prisma";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  // Read access to the legacy Drive collection + Sheets used by Migration Center
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  // Write access to the MYSIMNUSA document folder (document storage provider).
  // Files stay private: access is only ever granted through application routes.
  "https://www.googleapis.com/auth/drive.file",
];

/**
 * Google connections are role-scoped and must never be mixed:
 *
 *   SOURCE      → legacy Drive + Sheets. READ ONLY. Never receives new files.
 *   DESTINATION → production document storage. WRITE ONLY. Never reads legacy data.
 *
 * Role selection is enforced *here*, on the server, from a typed value — never
 * from anything the client sends. A caller cannot pass an arbitrary string and
 * silently reach the wrong account.
 */
export type GoogleRole = "SOURCE" | "DESTINATION";

export function isGoogleRole(value: unknown): value is GoogleRole {
  return value === "SOURCE" || value === "DESTINATION";
}

/** Scopes required per role. Kept minimal: source never gets write access. */
export function scopesForRole(role: GoogleRole): string[] {
  if (role === "SOURCE") {
    return [
      "openid",
      "email",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
    ];
  }
  return [
    "openid",
    "email",
    // drive.file only grants access to files this app creates/opens — it cannot
    // list or modify the rest of the account, which is exactly what we want.
    "https://www.googleapis.com/auth/drive.file",
  ];
}

export interface GoogleTokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

const STATE_TTL_MS = 10 * 60 * 1000;
const REFRESH_MARGIN_MS = 60 * 1000;

/**
 * Resolves the stored connection row for a role.
 * The DESTINATION connection is what GoogleDriveStorage uses; SOURCE is only
 * ever used to read legacy data.
 */
async function findConnection(role: GoogleRole) {
  return prisma.migrationConnection.findUnique({ where: { role } });
}

function cfg() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI?.trim() ||
    `${process.env.NEXTAUTH_URL?.trim() || "http://localhost:3000"}/api/admin/migration/google/callback`;
  return { clientId, clientSecret, redirectUri };
}

export function isGoogleConfigured(): boolean {
  const { clientId, clientSecret } = cfg();
  return Boolean(clientId && clientSecret);
}

// ─── AES-256-GCM token encryption at rest ────────────────────

function encKey(): Buffer {
  return crypto
    .createHash("sha256")
    .update(process.env.AUTH_SECRET || "dev-secret-change-in-production-32chars")
    .digest();
}

export function encryptJson(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${data.toString("base64url")}`;
}

export function decryptJson<T>(payload: string): T | null {
  try {
    const [v, ivs, tags, datas] = payload.split(".");
    if (v !== "v1") return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", encKey(), Buffer.from(ivs!, "base64url"));
    decipher.setAuthTag(Buffer.from(tags!, "base64url"));
    const data = Buffer.concat([decipher.update(Buffer.from(datas!, "base64url")), decipher.final()]);
    return JSON.parse(data.toString("utf8")) as T;
  } catch {
    return null;
  }
}

// ─── CSRF state (signed, short-lived) ────────────────────────

function sign(payload: string): string {
  return crypto.createHmac("sha256", encKey()).update(payload).digest("base64url");
}

/**
 * Signs the OAuth `state`, binding it to (userId, role). The role is part of the
 * signed payload, so an SOURCE authorization callback cannot be replayed to
 * populate the DESTINATION connection (or vice versa).
 */
export function makeState(userId: string, role: GoogleRole): string {
  const exp = Date.now() + STATE_TTL_MS;
  const payload = `${userId}.${role}.${exp}`;
  return Buffer.from(`${payload}.${sign(payload)}`).toString("base64url");
}

export function verifyState(state: string): { userId: string; role: GoogleRole } | null {
  try {
    const raw = Buffer.from(state, "base64url").toString("utf8");
    const [userId, role, expStr, sig] = raw.split(".");
    if (!userId || !role || !expStr || !sig) return null;
    if (!isGoogleRole(role)) return null;
    if (Number(expStr) < Date.now()) return null;
    const expected = sign(`${userId}.${role}.${expStr}`);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return { userId, role };
  } catch {
    return null;
  }
}

// ─── OAuth endpoints ─────────────────────────────────────────

export function buildAuthUrl(userId: string, role: GoogleRole): string {
  const { clientId, redirectUri } = cfg();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    // Role-scoped scopes: SOURCE is read-only, DESTINATION is write-only.
    scope: scopesForRole(role).join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: makeState(userId, role),
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function tokenRequest(body: Record<string, string>): Promise<GoogleTokenSet> {
  const { clientId, clientSecret, redirectUri } = cfg();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, ...body }),
  });
  const json = (await res.json().catch(() => null)) as (GoogleTokenSet & { error?: string; error_description?: string }) | null;
  if (!res.ok || !json?.access_token) {
    throw new Error(json?.error_description || json?.error || `Token request gagal (HTTP ${res.status})`);
  }
  return json;
}

export async function exchangeCode(code: string): Promise<GoogleTokenSet> {
  return tokenRequest({ code, grant_type: "authorization_code" });
}

export async function refreshTokens(refreshToken: string): Promise<GoogleTokenSet> {
  return tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
}

export async function fetchUserInfo(accessToken: string): Promise<{ email?: string }> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Gagal mengambil info akun (HTTP ${res.status})`);
  return (await res.json()) as { email?: string };
}

// ─── Connection persistence ──────────────────────────────────

export interface ConnectionPublic {
  role: GoogleRole;
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  email: string | null;
  scopes: string[];
  connectedAt: string | null;
  lastCheckedAt: string | null;
}

function toPublic(role: GoogleRole, row: Awaited<ReturnType<typeof findConnection>>): ConnectionPublic {
  return {
    role,
    status: (row?.status as ConnectionPublic["status"]) ?? "DISCONNECTED",
    email: row?.googleAccountEmail ?? null,
    scopes: Array.isArray(row?.scopes) ? (row!.scopes as string[]) : [],
    connectedAt: row?.connectedAt?.toISOString() ?? null,
    lastCheckedAt: row?.lastCheckedAt?.toISOString() ?? null,
  };
}

export async function getConnectionPublic(role: GoogleRole): Promise<ConnectionPublic> {
  return toPublic(role, await findConnection(role));
}

/** Both roles at once, for the Migration Center status panel. */
export async function getConnectionsPublic(): Promise<{ source: ConnectionPublic; destination: ConnectionPublic }> {
  const [source, destination] = await Promise.all([
    getConnectionPublic("SOURCE"),
    getConnectionPublic("DESTINATION"),
  ]);
  return { source, destination };
}

async function saveConnection(
  role: GoogleRole,
  tokens: GoogleTokenSet,
  email: string | null,
  userId: string
): Promise<void> {
  const expiryDate = tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined;
  const stored: GoogleTokenSet & { expiry_date?: number } = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type,
    scope: tokens.scope,
    expiry_date: expiryDate,
  };
  const data = {
    role,
    googleAccountEmail: email,
    status: "CONNECTED",
    scopes: (tokens.scope ?? scopesForRole(role).join(" ")).split(/\s+/),
    tokenEncrypted: encryptJson(stored),
    lastCheckedAt: new Date(),
    connectedBy: userId,
    connectedAt: new Date(),
    disconnectedAt: null,
  };
  await prisma.migrationConnection.upsert({
    where: { role },
    update: data,
    create: data,
  });
}

/**
 * OAuth callback: exchange the code, identify the authorizing account and
 * persist the encrypted tokens **for the requested role only**.
 *
 * The role comes from the signed state, so a user cannot connect the legacy
 * source account into the destination slot or the reverse.
 */
export async function connectFromCode(
  code: string,
  userId: string,
  role: GoogleRole
): Promise<ConnectionPublic> {
  const tokens = await exchangeCode(code);
  const info = await fetchUserInfo(tokens.access_token);
  await saveConnection(role, tokens, info.email ?? null, userId);
  return getConnectionPublic(role);
}

export async function disconnect(userId: string, role: GoogleRole): Promise<void> {
  const row = await findConnection(role);
  // Revoke at Google (best-effort; token never logged)
  const tokens = row?.tokenEncrypted ? decryptJson<GoogleTokenSet>(row.tokenEncrypted) : null;
  if (tokens?.access_token) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: tokens.access_token }),
      });
    } catch {
      // best-effort
    }
  }
  const data = {
    role,
    status: "DISCONNECTED",
    tokenEncrypted: null,
    googleAccountEmail: null,
    scopes: [],
    disconnectedAt: new Date(),
    lastCheckedAt: new Date(),
    connectedBy: userId,
  };
  await prisma.migrationConnection.upsert({
    where: { role },
    update: data,
    create: data,
  });
}

/**
 * Returns a valid access token for a role, refreshing transparently.
 *
 * The role is a typed server-side value; there is no way to obtain a
 * DESTINATION token for a source operation or the reverse.
 */
export async function getAccessToken(role: GoogleRole): Promise<string | null> {
  const row = await findConnection(role);
  if (!row?.tokenEncrypted || row.status !== "CONNECTED") return null;
  const tokens = decryptJson<GoogleTokenSet & { expiry_date?: number }>(row.tokenEncrypted);
  if (!tokens?.access_token) return null;

  const expiring = !tokens.expiry_date || tokens.expiry_date - REFRESH_MARGIN_MS < Date.now();
  if (expiring && tokens.refresh_token) {
    try {
      const fresh = await refreshTokens(tokens.refresh_token);
      const merged: GoogleTokenSet & { expiry_date?: number } = {
        ...tokens,
        access_token: fresh.access_token,
        expires_in: fresh.expires_in,
        expiry_date: fresh.expires_in ? Date.now() + fresh.expires_in * 1000 : tokens.expiry_date,
      };
      await prisma.migrationConnection.update({
        where: { role },
        data: { tokenEncrypted: encryptJson(merged), lastCheckedAt: new Date() },
      });
      return merged.access_token;
    } catch {
      await prisma.migrationConnection
        .update({ where: { role }, data: { status: "ERROR", lastCheckedAt: new Date() } })
        .catch(() => undefined);
      return null;
    }
  }
  return tokens.access_token;
}

/** Authenticated GET to a Google API for a specific role. */
export async function fetchGoogle(role: GoogleRole, url: string): Promise<Response> {
  let token = await getAccessToken(role);
  if (!token) throw new Error(googleNotConnectedMessage(role));
  let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    await prisma.migrationConnection
      .update({ where: { role }, data: { status: "ERROR", lastCheckedAt: new Date() } })
      .catch(() => undefined);
    token = await getAccessToken(role);
    if (!token) throw new Error("Sesi Google kedaluwarsa — silakan sambungkan ulang");
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }
  return res;
}

/**
 * Authenticated request to a Google API with any HTTP method.
 *
 * Used by the document storage provider (DESTINATION drive writes) and by the
 * migration engine (SOURCE drive reads). Tokens are refreshed once on 401.
 * Credentials never leave the server.
 */
export async function googleFetch(
  role: GoogleRole,
  url: string,
  init: RequestInit = {},
  retryOn401 = true,
): Promise<Response> {
  const token = await getAccessToken(role);
  if (!token) throw new Error(googleNotConnectedMessage(role));

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { ...init, headers });
  if (res.status === 401 && retryOn401) {
    await prisma.migrationConnection
      .update({ where: { role }, data: { status: "ERROR", lastCheckedAt: new Date() } })
      .catch(() => undefined);
    return googleFetch(role, url, init, false);
  }
  return res;
}

/** Authenticated JSON request helper (parses the body, throwing on failure). */
export async function googleFetchJson<T>(
  role: GoogleRole,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await googleFetch(role, url, init);
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Google API ${res.status}: ${text.slice(0, 200)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/** Authenticated streaming request helper (used for file downloads). */
export async function googleFetchStream(
  role: GoogleRole,
  url: string,
  init: RequestInit = {},
): Promise<{ body: ReadableStream<Uint8Array>; contentType?: string; contentLength?: number } | null> {
  const res = await googleFetch(role, url, init);
  if (res.status === 404) return null;
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google API ${res.status}: ${detail.slice(0, 200)}`);
  }
  const length = res.headers.get("content-length");
  return {
    body: res.body as ReadableStream<Uint8Array>,
    contentType: res.headers.get("content-type") ?? undefined,
    contentLength: length ? Number(length) : undefined,
  };
}

function googleNotConnectedMessage(role: GoogleRole): string {
  return role === "SOURCE"
    ? "Akun Google SUMBER belum tersambung. Hubungkan akun sumber (read-only) di Migration Center."
    : "Akun Google TUJUAN belum tersambung. Hubungkan akun penyimpanan produksi di Migration Center.";
}
