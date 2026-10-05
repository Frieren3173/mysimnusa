import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/constants";
import { connectFromCode, verifyState, isGoogleConfigured } from "@/lib/google/auth";

function redirect(origin: string, query: string) {
  return Response.redirect(`${origin}/settings/system/migration?google=${query}`, 302);
}

/**
 * OAuth callback shared by both roles.
 *
 * The role is read from the **signed** state (never from a query parameter), so
 * an authorization started for SOURCE can only ever populate the SOURCE
 * connection — the destination slot cannot be hijacked by replaying a callback.
 */
export async function GET(req: NextRequest) {
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  const origin = `${proto}://${host}`;
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  if (oauthError) return redirect(origin, "denied");
  if (!code || !state) return redirect(origin, "invalid");

  const verified = verifyState(state);
  if (!verified) return redirect(origin, "expired");

  const user = await getCurrentUser();
  if (!user || (!user.hasPermission(PERMISSIONS.ADMIN_MIGRATION) && !user.isSuperAdmin())) {
    return redirect(origin, "forbidden");
  }
  if (user.id !== verified.userId) return redirect(origin, "expired");
  if (!isGoogleConfigured()) return redirect(origin, "not_configured");

  try {
    await connectFromCode(code, user.id, verified.role);
    return redirect(origin, verified.role === "SOURCE" ? "connected_source" : "connected_destination");
  } catch {
    return redirect(origin, "error");
  }
}
