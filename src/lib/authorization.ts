import { getCurrentUser } from "./auth";
import { redirect } from "next/navigation";

/** Require authenticated session. Redirects to /login if not. */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Require specific role. Returns 403 page if unauthorized. */
export async function requireRole(role: string) {
  const user = await requireAuth();
  if (!user.hasRole(role) && !user.isSuperAdmin()) {
    redirect("/403");
  }
  return user;
}

/** Require specific permission. Returns 403 page if unauthorized. */
export async function requirePermission(permission: string) {
  const user = await requireAuth();
  if (!user.hasPermission(permission) && !user.isSuperAdmin()) {
    redirect("/403");
  }
  return user;
}

/** Check permission without redirecting (use in API routes) */
export async function checkPermission(
  permission: string
): Promise<{
  authorized: boolean;
  user: Awaited<ReturnType<typeof requireAuth>> | null;
}> {
  const user = await getCurrentUser();
  if (!user) return { authorized: false, user: null };
  const authorized = user.hasPermission(permission) || user.isSuperAdmin();
  return { authorized, user: authorized ? user : null };
}

/** RBAC middleware for API routes */
export function withPermission(permission: string) {
  return async function <T>(
    handler: (user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) => Promise<T>
  ): Promise<T | Response> {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }
    if (!user.hasPermission(permission) && !user.isSuperAdmin()) {
      return Response.json({ success: false, error: { code: "FORBIDDEN", message: "Insufficient permissions" } }, { status: 403 });
    }
    return handler(user);
  };
}
