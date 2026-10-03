import { ok, err } from "@/lib/api";
import { requireMigrationUser } from "@/lib/migration/auth";
import { forceImportItem } from "@/lib/migration/engine";

export async function POST(_req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  const { itemId } = await params;
  try {
    const result = await forceImportItem(itemId, user.id);
    return ok(result);
  } catch (e) {
    return err("FORCE_IMPORT_FAILED", e instanceof Error ? e.message : "Gagal mengimpor item", 400);
  }
}
