import { deleteSession } from "@/lib/auth";
import { ok } from "@/lib/api";

export async function POST() {
  await deleteSession();
  return ok({ message: "Berhasil keluar" });
}
