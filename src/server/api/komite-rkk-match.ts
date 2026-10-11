import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { matchFiles } from "@/lib/komite/rkk-match";
import { logServerError, safeErrorMessage } from "@/lib/logger";

/**
 * POST /api/komite/rkk/match
 *
 * PREVIEW-ONLY: matches a list of RKK file names against registered staff and
 * returns a match report (matched / unmatched / ambiguous). It writes NOTHING —
 * no documents are created or moved. The owner runs this after providing the RKK
 * files to review the mapping before any import is finalised.
 *
 * Body: { fileNames: string[] }  (each a bare file name, no path).
 * Requires `komite.document.upload`.
 */
const MatchSchema = z.object({
  fileNames: z.array(z.string().trim().min(1).max(300)).min(1).max(2000),
});

export async function POST(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.KOMITE_DOCUMENT_UPLOAD);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(MatchSchema, body);
  if (error) return error;

  try {
    const staff = await prisma.staff.findMany({
      where: { isActive: true },
      select: { id: true, name: true, nip: true },
    });

    const report = matchFiles(data.fileNames, staff);

    // Return counts + the diagnostics (names only — no file contents, no PII
    // beyond the staff name the owner already sees in the app).
    return ok({
      total: report.total,
      counts: {
        matched: report.matched.length,
        unmatched: report.unmatched.length,
        ambiguous: report.ambiguous.length,
      },
      matched: report.matched.map((m) => ({ fileName: m.fileName, staffId: m.staffId, staffName: m.staffName, method: m.method })),
      unmatched: report.unmatched.map((m) => ({ fileName: m.fileName })),
      ambiguous: report.ambiguous.map((m) => ({ fileName: m.fileName, candidateCount: m.candidateCount, method: m.method })),
    });
  } catch (e) {
    logServerError("komite.rkk.match", e);
    return err("MATCH_FAILED", safeErrorMessage("MATCH_FAILED"), 500);
  }
}
