import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { err } from "@/lib/api";
import { contentDisposition } from "@/lib/file-type";
import { logServerError, safeErrorMessage } from "@/lib/logger";

/**
 * GET /api/borang/patient-register/template
 *
 * Downloads the Excel template for the patient register. The header row matches
 * EXACTLY what the importer accepts (No. | Nama Pasien | Nomor RM | Diagnosis),
 * so the template is guaranteed compatible with the parser.
 *
 * Requires the same upload permission as the register itself.
 */
export async function GET() {
  const { authorized, user } = await checkPermission(PERMISSIONS.BORANG_KARU_REVIEW);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Hanya Kepala Ruang yang dapat mengunduh template register", 403);

  try {
    const header = ["No.", "Nama Pasien", "Nomor RM", "Diagnosis"];
    const example = [1, "Contoh Nama (hapus baris ini)", "RM-0001", "Contoh diagnosis (opsional)"];
    const ws = XLSX.utils.aoa_to_sheet([header, example]);
    ws["!cols"] = [{ wch: 6 }, { wch: 34 }, { wch: 16 }, { wch: 34 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Register Pasien");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDisposition("attachment", "Template-Register-Pasien.xlsx"),
        "X-Content-Type-Options": "nosniff",
        "Content-Length": String(buf.byteLength),
      },
    });
  } catch (e) {
    logServerError("borang.patient-register.template", e);
    return err("TEMPLATE_FAILED", safeErrorMessage("TEMPLATE_FAILED"), 500);
  }
}
