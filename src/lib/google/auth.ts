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

export interface GoogleTokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

const CONNECTION_ID = "default";
const STATE_TTL_MS = 10 * 60 * 1000;
const REFRESH_MARGIN_MS = 60 * 1000;

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

export function makeState(userId: string): string {
  const exp = Date.now() + STATE_TTL_MS;
  return Buffer.from(`${userId}.${exp}.${sign(`${userId}.${exp}`)}`).toString("base64url");
}

export function verifyState(state: string): string | null {
  try {
    const raw = Buffer.from(state, "base64url").toString("utf8");
    const [userId, expStr, sig] = raw.split(".");
    if (!userId || !expStr || !sig) return null;
    if (Number(expStr) < Date.now()) return null;
    const expected = sign(`${userId}.${expStr}`);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return userId;
  } catch {
    return null;
  }
}

// ─── OAuth endpoints ─────────────────────────────────────────

export function buildAuthUrl(userId: string): string {
  const { clientId, redirectUri } = cfg();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: makeState(userId),
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
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  email: string | null;
  scopes: string[];
  connectedAt: string | null;
  lastCheckedAt: string | null;
}

export async function getConnectionPublic(): Promise<ConnectionPublic> {
  const row = await prisma.migrationConnection.findUnique({ where: { id: CONNECTION_ID } });
  return {
    status: (row?.status as ConnectionPublic["status"]) ?? "DISCONNECTED",
    email: row?.googleAccountEmail ?? null,
    scopes: Array.isArray(row?.scopes) ? (row!.scopes as string[]) : [],
    connectedAt: row?.connectedAt?.toISOString() ?? null,
    lastCheckedAt: row?.lastCheckedAt?.toISOString() ?? null,
  };
}

async function saveConnection(
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
    googleAccountEmail: email,
    status: "CONNECTED",
    scopes: (tokens.scope ?? GOOGLE_SCOPES.join(" ")).split(/\s+/),
    tokenEncrypted: encryptJson(stored),
    lastCheckedAt: new Date(),
    connectedBy: userId,
    connectedAt: new Date(),
    disconnectedAt: null,
  };
  await prisma.migrationConnection.upsert({
    where: { id: CONNECTION_ID },
    update: data,
    create: { id: CONNECTION_ID, ...data },
  });
}

/** OAuth callback: exchange code, identify account, persist encrypted tokens. */
export async function connectFromCode(code: string, userId: string): Promise<ConnectionPublic> {
  const tokens = await exchangeCode(code);
  const info = await fetchUserInfo(tokens.access_token);
  await saveConnection(tokens, info.email ?? null, userId);
  return getConnectionPublic();
}

export async function disconnect(userId: string): Promise<void> {
  const row = await prisma.migrationConnection.findUnique({ where: { id: CONNECTION_ID } });
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
    status: "DISCONNECTED",
    tokenEncrypted: null,
    googleAccountEmail: null,
    scopes: [],
    disconnectedAt: new Date(),
    lastCheckedAt: new Date(),
    connectedBy: userId,
  };
  await prisma.migrationConnection.upsert({
    where: { id: CONNECTION_ID },
    update: data,
    create: { id: CONNECTION_ID, ...data },
  });
}

/** Returns a valid access token, transparently refreshing when expired. */
export async function getAccessToken(): Promise<string | null> {
  const row = await prisma.migrationConnection.findUnique({ where: { id: CONNECTION_ID } });
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
        where: { id: CONNECTION_ID },
        data: { tokenEncrypted: encryptJson(merged), lastCheckedAt: new Date() },
      });
      return merged.access_token;
    } catch {
      await prisma.migrationConnection
        .update({ where: { id: CONNECTION_ID }, data: { status: "ERROR", lastCheckedAt: new Date() } })
        .catch(() => undefined);
      return null;
    }
  }
  return tokens.access_token;
}

/** Authenticated GET to a Google API. Retries once after refresh on 401. */
export async function fetchGoogle(url: string): Promise<Response> {
  let token = await getAccessToken();
  if (!token) throw new Error("Tidak terhubung ke akun Google");
  let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    await prisma.migrationConnection
      .update({ where: { id: CONNECTION_ID }, data: { status: "ERROR", lastCheckedAt: new Date() } })
      .catch(() => undefined);
    token = await getAccessToken();
    if (!token) throw new Error("Sesi Google kedaluwarsa — silakan sambungkan ulang");
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }
  return res;
}

/**
 * Authenticated request to a Google API with any HTTP method.
 *
 * Used by the document storage provider (Drive uploads/deletes) and by the
 * migration engine. Tokens are refreshed once on 401 before failing.
 * Credentials never leave the server.
 */
export async function googleFetch(
  url: string,
  init: RequestInit = {},
  retryOn401 = true,
): Promise<Response> {
  const token = await getAccessToken();
  if (!token) throw new Error("Tidak terhubung ke akun Google");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { ...init, headers });
  if (res.status === 401 && retryOn401) {
    await prisma.migrationConnection
      .update({ where: { id: CONNECTION_ID }, data: { status: "ERROR", lastCheckedAt: new Date() } })
      .catch(() => undefined);
    return googleFetch(url, init, false);
  }
  return res;
}
