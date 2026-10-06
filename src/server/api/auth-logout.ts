import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@/lib/auth";
import { ok } from "@/lib/api";

/**
 * Log out the current user.
 *
 * - `fetch()` callers (e.g. the account dropdown) receive JSON and redirect
 *   client-side.
 * - Form/plain-navigation callers are redirected straight to the landing page
 *   (`/`) so the browser never renders the raw JSON payload.
 *
 * The session row and cookie are always cleared before any response.
 */
export async function POST(req: NextRequest) {
  await deleteSession();

  const accept = req.headers.get("accept") ?? "";
  const wantsHtml = accept.includes("text/html") && !accept.includes("application/json");

  if (wantsHtml) {
    return NextResponse.redirect(new URL("/", req.url), { status: 303 });
  }

  return ok({ message: "Berhasil keluar" });
}
