import { NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { requireMigrationUser } from "@/lib/migration/auth";
import { runSyncChunk } from "@/lib/migration/sync";

export async function POST(req: NextRequest) {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  const body = await req.json().catch(() => ({}));
  const limit = Number.isFinite(body?.limit) ? Number(body.limit) : 8;
  const resetFailed = body?.resetFailed === true;

  try {
    return ok(await runSyncChunk(limit, resetFailed));
  } catch (e) {
    return err("SYNC_FAILED", e instanceof Error ? e.message : "Sinkronisasi gagal", 500);
  }
}
