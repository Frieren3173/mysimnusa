import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS, NOTIFICATION_TYPES } from "@/lib/constants";
import { logAudit, clientIp } from "@/lib/audit";
import { separationOfDutiesViolation } from "@/lib/borang-access";
import {
  WORKFLOW_TRANSITIONS,
  requiresNote,
} from "@/lib/borang-workflow";
import { loadBorangScope, canAccessBorangEntry } from "@/lib/borang-scope";
import { notify, notifySecretariat } from "@/lib/notifications";
import { logServerError, safeErrorMessage } from "@/lib/logger";

const WorkflowSchema = z.object({
  action: z.enum([
    // legacy
    "SUBMIT",
    "VERIFY",
    "APPROVE",
    "REJECT",
    "ARCHIVE",
    // workflow v1
    "APPROVE_KARU",
    "REQUEST_REVISION",
    "ADMIN_REVISION",
    "READY_TO_PRINT",
    "PRINT",
    "COMPLETE",
  ]),
  notes: z.string().trim().max(1000).optional(),
  reason: z.string().trim().max(1000).optional(),
});

/**
 * Legacy logbook workflow transitions (kept unchanged for backward
 * compatibility — see tests/borang-workflow.test.ts). New workflow actions are
 * defined in `@/lib/borang-workflow` (WORKFLOW_TRANSITIONS) and dispatched
 * separately below.
 */
export const TRANSITIONS: Record<
  string,
  { from: string[]; to: string; permission: string; audit: string }
> = {
  SUBMIT: { from: ["DRAFT", "REJECTED"], to: "SUBMITTED", permission: PERMISSIONS.BORANG_LOGBOOK_SUBMIT, audit: "SUBMITTED" },
  VERIFY: { from: ["SUBMITTED"], to: "VERIFICATION", permission: PERMISSIONS.BORANG_LOGBOOK_VERIFY, audit: "VERIFIED" },
  APPROVE: { from: ["VERIFICATION"], to: "APPROVED", permission: PERMISSIONS.BORANG_LOGBOOK_APPROVE, audit: "APPROVED" },
  REJECT: { from: ["SUBMITTED", "VERIFICATION"], to: "REJECTED", permission: PERMISSIONS.BORANG_LOGBOOK_REJECT, audit: "REJECTED" },
  ARCHIVE: { from: ["APPROVED"], to: "ARCHIVED", permission: PERMISSIONS.BORANG_LOGBOOK_ARCHIVE, audit: "ARCHIVED" },
};

/** Workflow v1 actions handled by the new dispatcher. */
const WORKFLOW_V1_ACTIONS = [
  "SUBMIT",
  "APPROVE_KARU",
  "REQUEST_REVISION",
  "ADMIN_REVISION",
  "READY_TO_PRINT",
  "PRINT",
  "COMPLETE",
] as const;

function isWorkflowV1(action: string): boolean {
  return (WORKFLOW_V1_ACTIONS as readonly string[]).includes(action);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(WorkflowSchema, body);
  if (error) return error;

  const { id } = await params;

  // The scope is only needed for the new workflow; load lazily once we know the
  // action so the legacy path keeps its previous cost profile.
  if (isWorkflowV1(data.action)) {
    return handleWorkflowV1(req, id, data);
  }
  return handleLegacy(req, id, data);
}

// ─────────────────────────────────────────────────────────────
// Legacy handler (VERIFY / APPROVE / REJECT / ARCHIVE) — unchanged behaviour
// ─────────────────────────────────────────────────────────────

type WorkflowBody = z.infer<typeof WorkflowSchema>;

async function handleLegacy(req: NextRequest, id: string, data: WorkflowBody) {
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

  const entry = await prisma.borangEntry.findUnique({ where: { id } });
  if (!entry) return err("NOT_FOUND", "Entri tidak ditemukan", 404);
  if (!transition.from.includes(entry.status)) {
    return err(
      "INVALID_TRANSITION",
      `Status "${entry.status}" tidak dapat diubah menjadi ${transition.to}`,
      409
    );
  }

  if (data.action === "VERIFY" || data.action === "APPROVE") {
    const violation = separationOfDutiesViolation(user, entry, data.action);
    if (violation) {
      await logAudit({
        userId: user.id,
        staffId: entry.staffId,
        borangId: id,
        module: "borang",
        resource: "borang_entry",
        resourceId: id,
        action: "SEPARATION_OF_DUTIES_DENIED",
        after: { attempted: data.action, status: entry.status },
        ipAddress: clientIp(req),
      });
      return err("SEPARATION_OF_DUTIES", violation, 403);
    }
  }

  const now = new Date();
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.borangEntry.update({
        where: { id },
        data: {
          status: transition.to as never,
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
    logServerError("borang-entries-$id$-workflow", e);
    return err("WORKFLOW_FAILED", safeErrorMessage("WORKFLOW_FAILED"), 500);
  }
}

// ─────────────────────────────────────────────────────────────
// Workflow v1 handler
// ─────────────────────────────────────────────────────────────

async function handleWorkflowV1(req: NextRequest, id: string, data: WorkflowBody) {
  const transition = WORKFLOW_TRANSITIONS[data.action];
  if (!transition) return err("BAD_ACTION", "Aksi tidak dikenal", 400);

  const { authorized, user } = await checkPermission(transition.permission);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  if (requiresNote(data.action) && !data.notes) {
    return err("NOTE_REQUIRED", "Catatan wajib diisi untuk permintaan revisi", 422, {
      notes: ["Catatan/revisi wajib diisi"],
    });
  }

  const entry = await prisma.borangEntry.findUnique({
    where: { id },
    include: { room: { select: { id: true, name: true } }, staff: { select: { id: true, name: true } } },
  });
  if (!entry) return err("NOT_FOUND", "Borang tidak ditemukan", 404);

  if (!transition.from.includes(entry.status)) {
    return err(
      "INVALID_TRANSITION",
      `Status "${entry.status}" tidak dapat diproses dengan aksi ${data.action}`,
      409,
    );
  }

  const scope = await loadBorangScope(user);

  // Ownership/scoping for the owner-driven SUBMIT.
  if (data.action === "SUBMIT") {
    if (!user.isSuperAdmin() && !canAccessBorangEntry(scope, user.id, entry)) {
      await logAudit({
        userId: user.id,
        staffId: entry.staffId,
        borangId: id,
        module: "borang",
        resource: "borang_entry",
        resourceId: id,
        action: "SUBMIT_FORBIDDEN",
        after: { attempted: data.action, roomId: entry.roomId },
        ipAddress: clientIp(req),
      });
      return err("FORBIDDEN", "Anda tidak berhak mengajukan Borang ini.", 403);
    }
    // A Borang may only be submitted when its room has a Kepala Ruang mapping.
    const mapping = await resolveKaruSnapshot(entry.roomId);
    if (!mapping) {
      return err(
        "NO_KEPALA_RUANG",
        "Ruangan ini belum memiliki Kepala Ruang. Pengajuan tidak dapat dilakukan sebelum penugasan dibuat.",
        409,
      );
    }
  }

  // Room scoping for the Kepala Ruang actions: only the assigned reviewer (or
  // superadmin) may approve / request revision.
  if (data.action === "APPROVE_KARU" || data.action === "REQUEST_REVISION") {
    if (!user.isSuperAdmin()) {
      const isAssigned =
        (entry.kepalaRuangUserId && entry.kepalaRuangUserId === user.id) ||
        (entry.roomId && scope.assignedRoomIds.includes(entry.roomId));
      if (!isAssigned) {
        await logAudit({
          userId: user.id,
          staffId: entry.staffId,
          borangId: id,
          module: "borang",
          resource: "borang_entry",
          resourceId: id,
          action: "CROSS_ROOM_DENIED",
          after: { attempted: data.action, roomId: entry.roomId },
          ipAddress: clientIp(req),
        });
        return err(
          "FORBIDDEN_ROOM",
          "Anda hanya dapat mereview Borang dari ruangan yang ditugaskan kepada Anda.",
          403,
        );
      }
    }
    // Separation of duties: the submitting user cannot approve their own entry.
    if (entry.submittedById && entry.submittedById === user.id) {
      return err("SEPARATION_OF_DUTIES", "Pengaju tidak dapat menyetujui Borangnya sendiri.", 403);
    }
  }

  const now = new Date();
  try {
    const mapping = data.action === "SUBMIT" ? await resolveKaruSnapshot(entry.roomId) : null;

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.borangEntry.update({
        where: { id },
        data: {
          status: transition.to as never,
          ...(data.action === "SUBMIT"
            ? {
                submittedAt: now,
                submittedById: user.id,
                rejectReason: null,
                kepalaRuangUserId: mapping?.userId ?? null,
                kepalaRuangName: mapping?.name ?? null,
                kepalaRuangNip: mapping?.nip ?? null,
              }
            : {}),
          ...(data.action === "APPROVE_KARU"
            ? {
                kepalaRuangAt: now,
                approvedAt: now,
                kepalaRuangUserId: entry.kepalaRuangUserId ?? user.id,
              }
            : {}),
          ...(data.action === "REQUEST_REVISION" || data.action === "ADMIN_REVISION"
            ? { rejectReason: data.notes, kepalaRuangAt: data.action === "REQUEST_REVISION" ? now : entry.kepalaRuangAt }
            : {}),
          ...(data.action === "READY_TO_PRINT"
            ? { adminReviewedAt: now, adminReviewedById: user.id, printReadyAt: now }
            : {}),
          ...(data.action === "PRINT" ? { printedAt: now, printedById: user.id } : {}),
          ...(data.action === "COMPLETE" ? { completedAt: now, completedById: user.id } : {}),
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
          notes: data.notes ?? null,
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
      after: { status: transition.to, notes: data.notes },
      ipAddress: clientIp(req),
    });

    // Notifications (best-effort).
    await sendWorkflowNotifications(data.action, {
      submitterId: entry.submittedById ?? entry.createdById,
      kepalaRuangUserId: mapping?.userId ?? updated.kepalaRuangUserId,
      roomName: updated.room?.name ?? "-",
      staffName: updated.staff?.name ?? "-",
    });

    return ok({ entry: updated });
  } catch (e) {
    logServerError("borang-entries-$id$-workflow", e);
    return err("WORKFLOW_FAILED", safeErrorMessage("WORKFLOW_FAILED"), 500);
  }
}

async function sendWorkflowNotifications(
  action: string,
  ctx: {
    submitterId: string | null;
    kepalaRuangUserId: string | null;
    roomName: string;
    staffName: string;
  },
): Promise<void> {
  switch (action) {
    case "SUBMIT":
      if (ctx.kepalaRuangUserId && ctx.kepalaRuangUserId !== ctx.submitterId) {
        await notify({
          userId: ctx.kepalaRuangUserId,
          type: NOTIFICATION_TYPES.BORANG_KARU_QUEUED,
          title: "Borang menunggu review",
          message: `Borang ruangan ${ctx.roomName} menunggu persetujuan Kepala Ruang.`,
          link: "/borang/review",
        });
      }
      break;
    case "APPROVE_KARU":
      if (ctx.submitterId) {
        await notify({
          userId: ctx.submitterId,
          type: NOTIFICATION_TYPES.BORANG_KARU_APPROVED,
          title: "Borang disetujui Kepala Ruang",
          message: `Borang ruangan ${ctx.roomName} telah disetujui Kepala Ruang.`,
          link: "/borang/logbook",
        });
      }
      await notifySecretariat({
        type: NOTIFICATION_TYPES.BORANG_SECRETARIAT_QUEUED,
        title: "Borang masuk antrean sekretariat",
        message: `Borang ruangan ${ctx.roomName} menunggu proses administratif.`,
        link: "/borang/secretariat",
      });
      break;
    case "REQUEST_REVISION":
    case "ADMIN_REVISION":
      if (ctx.submitterId) {
        await notify({
          userId: ctx.submitterId,
          type: NOTIFICATION_TYPES.BORANG_REVISION_NEEDED,
          title: "Borang perlu revisi",
          message: `Borang ruangan ${ctx.roomName} dikembalikan untuk revisi.`,
          link: "/borang/logbook",
        });
      }
      break;
    case "READY_TO_PRINT":
      if (ctx.submitterId) {
        await notify({
          userId: ctx.submitterId,
          type: NOTIFICATION_TYPES.BORANG_READY_TO_PRINT,
          title: "Borang siap dicetak",
          message: `Borang ruangan ${ctx.roomName} siap dicetak.`,
          link: "/borang/logbook",
        });
      }
      break;
    default:
      break;
  }
}

/** Resolves the current Kepala Ruang mapping for a room (or null). */
export async function resolveKaruSnapshot(
  roomId: string | null,
): Promise<{ userId: string; name: string; nip: string | null } | null> {
  if (!roomId) return null;
  const mapping = await prisma.roomKepalaRuang.findUnique({
    where: { roomId },
    select: { userId: true, name: true, nip: true },
  });
  return mapping ? { userId: mapping.userId, name: mapping.name, nip: mapping.nip } : null;
}
