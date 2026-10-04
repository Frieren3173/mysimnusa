import { NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { requireMigrationUser } from "@/lib/migration/auth";
import { assessBatch } from "@/lib/migration/engine";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  const { batchId } = await params;
  try {
    return ok(await assessBatch(batchId));
  } catch (e) {
    return err("ASSESS_FAILED", e instanceof Error ? e.message : "Assesmen gagal", 500);
  }
}
