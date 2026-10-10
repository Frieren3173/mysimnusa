import { vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-level test harness.
 *
 * Provides:
 *  • a configurable current user (permissions/superadmin), and
 *  • helpers to build `NextRequest`s and read the JSON response body.
 *
 * Convention: each test file calls `vi.mock(...)` for `@/lib/prisma`,
 * `@/lib/auth`, `@/lib/audit` and `@/lib/logger` BEFORE importing the route,
 * then uses `setCurrentUser` to drive authorization.
 */

export interface TestUser {
  id: string;
  roles: string[];
  permissions: Set<string>;
  hasPermission: (p: string) => boolean;
  isSuperAdmin: () => boolean;
  email?: string | null;
  username?: string;
  staff?: { name: string } | null;
  getCurrentUser?: () => Promise<TestUser | null>;
}

export function userWith(perms: string[], superAdmin = false, id = "user_test"): TestUser {
  const set = new Set(perms);
  return {
    id,
    roles: superAdmin ? ["SUPER_ADMIN"] : ["USER"],
    permissions: set,
    hasPermission: (p: string) => set.has(p),
    isSuperAdmin: () => superAdmin,
    email: "tester@example.test",
    username: "tester",
    staff: { name: "Tester" },
  };
}

/** Mutable holder so `vi.mock("@/lib/auth")` can point at the current user. */
export const authState: { current: TestUser | null } = { current: null };
export function setCurrentUser(u: TestUser | null) {
  authState.current = u;
}

export const SUPERADMIN = () => userWith([], true, "user_admin");

/** Builds a NextRequest with a JSON body for a route handler. */
export function jsonRequest(url: string, body?: unknown, method = "POST"): NextRequest {
  return new NextRequest(`http://localhost:3230${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Builds a GET NextRequest. */
export function getRequest(url: string): NextRequest {
  return new NextRequest(`http://localhost:3230${url}`, { method: "GET" });
}

export interface NormalizedResponse {
  status: number;
  success: boolean;
  data?: Record<string, unknown> | null;
  error?: { code: string; message: string; fields?: Record<string, string[]> };
}

/** Reads a Response produced by `ok`/`err` into a plain object. */
export async function readResponse(res: Response): Promise<NormalizedResponse> {
  const status = res.status;
  const body = (await res.json()) as { success: boolean; data?: Record<string, unknown>; error?: NormalizedResponse["error"] };
  return { status, success: body.success, data: body.data ?? null, error: body.error };
}

/** Convenience: params object for dynamic routes. */
export function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

/** Silences expected console noise from mocked audit/logger. */
export function noopAuditMock() {
  return { logAudit: vi.fn(async () => undefined), clientIp: () => "127.0.0.1" };
}
