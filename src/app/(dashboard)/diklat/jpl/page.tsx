import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";

/**
 * The JPL dashboard was merged into the main Diklat dashboard (`/diklat`).
 * This route is kept only to forward old links/bookmarks, preserving any
 * query params (year / roomId / search / page) so existing URLs keep working.
 */
export default async function JplRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Keep the same permission gate the merged page requires.
  await requirePermission(PERMISSIONS.DIKLAT_TRAINING_READ);
  const params = await searchParams;

  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
    else qs.set(key, value);
  }
  const suffix = qs.toString();
  redirect(`/diklat${suffix ? `?${suffix}` : ""}`);
}
