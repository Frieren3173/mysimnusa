import { NextResponse } from "next/server";
import { err } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { readTemplate, templateExists } from "@/lib/diklat/certificate";
import { contentDisposition } from "@/lib/file-type";

/**
 * Download the blank certificate template (.pptx) so an administrator can see /
 * reuse the official design. This is the exact template the generator fills.
 */
export async function GET() {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_CERTIFICATE_READ);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);
  if (!templateExists()) return err("TEMPLATE_MISSING", "Template sertifikat belum tersedia", 404);

  const buffer = readTemplate();
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": contentDisposition(
        "attachment",
        "Contoh_Template_Sertifikat_IHT.pptx",
      ),
      "X-Content-Type-Options": "nosniff",
      "Content-Length": String(buffer.byteLength),
    },
  });
}
