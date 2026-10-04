import { NextRequest } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { ok, err } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { logAudit, clientIp } from "@/lib/audit";
import { SLIDES_DIR, SLIDE_MIME, listSlides } from "@/lib/slides";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB per file

export async function GET() {
  const { authorized, user } = await checkPermission(PERMISSIONS.ADMIN_SETTINGS);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  return ok({ slides: listSlides() });
}

export async function POST(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.ADMIN_SETTINGS);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err("INVALID_FORM", "Request harus multipart/form-data", 400);
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return err("NO_FILE", "File belum dipilih", 422);

  for (const file of files) {
    if (file.size === 0) return err("NO_FILE", "File kosong", 422);
    if (file.size > MAX_SIZE) {
      return err("FILE_TOO_LARGE", `Ukuran maksimal 5 MB per file (${file.name})`, 413);
    }
    if (!SLIDE_MIME[file.type]) {
      return err("INVALID_TYPE", `Format tidak didukung: ${file.name}`, 415);
    }
  }

  try {
    fs.mkdirSync(SLIDES_DIR, { recursive: true });
    const saved: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filename = `${Date.now()}_${i}${SLIDE_MIME[file.type]}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(path.join(SLIDES_DIR, filename), buffer);
      saved.push(filename);
    }

    await logAudit({
      userId: user.id,
      module: "admin",
      resource: "slide",
      action: "CREATED",
      after: { files: saved },
      ipAddress: clientIp(req),
    });

    return ok({ slides: listSlides(), saved });
  } catch (e) {
    return err("UPLOAD_FAILED", e instanceof Error ? e.message : "Gagal mengunggah file", 500);
  }
}
