import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { logAudit, clientIp } from "@/lib/audit";

const WorkflowSchema = z.object({
  action: z.enum(["SUBMIT", "VERIFY", "APPROVE", "REJECT", "ARCHIVE"]),
  notes: z.string().trim().max(1000).optional(),
  reason: z.string().trim().max(1000).optional(),
});

const TRANSITIONS: Record<
  string,
  { from: string[]; to: string; permission: string; audit: string }
> = {
  SUBMIT: { from: ["DRAFT", "REJECTED"], to: "SUBMITTED", permission: PERMISSIONS.BORANG_LOGBOOK_SUBMIT, audit: "SUBMITTED" },
  VERIFY: { from: ["SUBMITTED"], to: "VERIFICATION", permission: PERMISSIONS.BORANG_LOGBOOK_VERIFY, audit: "VERIFIED" },
  APPROVE: { from: ["VERIFICATION"], to: "APPROVED", permission: PERMISSIONS.BORANG_LOGBOOK_APPROVE, audit: "APPROVED" },
  REJECT: { from: ["SUBMITTED", "VERIFICATION"], to: "REJECTED", permission: PERMISSIONS.BORANG_LOGBOOK_REJECT, audit: "REJECTED" },
  ARCHIVE: { from: ["APPROVED"], to: "ARCHIVED", permission: PERMISSIONS.BORANG_LOGBOOK_ARCHIVE, audit: "ARCHIVED" },
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(WorkflowSchema, body);
  if (error) return error;

  const transition = TRANSITIONS[data.action];
  if (!transition) return err("BAD_ACTION", "Aksi tidak dikenal", 400);

  const { authorized, user } = await checkPermission(transition.permission);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  if (data.action === "REJECT" && !data.reason) {
    return err("REASON_REQUIRED", "Penolakan wajib memiliki alasan", 422, {
      reason: ["Alasan penolakan wajib diisi"],
    });
  }

  const { id } = await params;
  const entry = await prisma.borangEntry.findUnique({ where: { id } });
  if (!entry) return err("NOT_FOUND", "Entri tidak ditemukan", 404);
  if (!transition.from.includes(entry.status)) {
    return err(
      "INVALID_TRANSITION",
      `Status "${entry.status}" tidak dapat diubah menjadi ${transition.to}`,
      409
    );
  }

  const now = new Date();
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.borangEntry.update({
        where: { id },
        data: {
          status: transition.to as never,
          ...(data.action === "SUBMIT" ? { submittedAt: now, rejectReason: null } : {}),
          ...(data.action === "VERIFY" ? { verifierId: user.id, verifiedAt: now } : {}),
          ...(data.action === "APPROVE" ? { approvedAt: now } : {}),
          ...(data.action === "ARCHIVE" ? { archivedAt: now } : {}),
          ...(data.action === "REJECT"
            ? { rejectReason: data.reason, verifierNotes: data.notes ?? null }
            : {}),
          ...(data.notes && data.action !== "REJECT" ? { verifierNotes: data.notes } : {}),
        },
        include: {
          staff: { select: { id: true, name: true, profession: true } },
          room: { select: { name: true } },
        },
      });

      await tx.borangVerification.create({
        data: {
          borangEntryId: id,
          verifierId: user.id,
          action: transition.audit,
          notes: data.action === "REJECT" ? data.reason : data.notes ?? null,
        },
      });

      return u;
    });

    await logAudit({
      userId: user.id,
      staffId: entry.staffId,
      borangId: id,
      module: "borang",
      resource: "borang_entry",
      resourceId: id,
      action: transition.audit,
      before: { status: entry.status },
      after: { status: transition.to, notes: data.notes, reason: data.reason },
      ipAddress: clientIp(req),
    });

    return ok({ entry: updated });
  } catch (e) {
    return err("WORKFLOW_FAILED", e instanceof Error ? e.message : "Gagal memproses", 500);
  }
}
