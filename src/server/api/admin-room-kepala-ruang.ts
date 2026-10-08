import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS, ROLES } from "@/lib/constants";
import { logAudit, clientIp } from "@/lib/audit";
import { logServerError, safeErrorMessage } from "@/lib/logger";

/**
 * Room → Kepala Ruang mapping (Superadmin-managed).
 *
 * GET  /api/admin/rooms/kepala-ruang
 *   Returns every active room with its current Kepala Ruang assignment (or
 *   null) plus a list of eligible Kepala Ruang candidates (active users holding
 *   the KEPALA_RUANG role, with their staff NIP when linked).
 *
 * PUT  /api/admin/rooms/kepala-ruang
 *   Body: { roomId, userId }  → assign/replace.
 *   Body: { roomId, userId: null } → clear.
 *
 * Authorisation: only Superadmin may read or mutate this mapping. The
 * permission gate mirrors admin settings, but the *role* check is what actually
 * restricts it to the superadmin account(s).
 */

async function requireSuperAdmin() {
  const { authorized, user } = await checkPermission(PERMISSIONS.ADMIN_SETTINGS);
  if (!user) return { error: err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401) };
  if (!authorized) return { error: err("FORBIDDEN", "Tidak memiliki akses", 403) };
  if (!user.isSuperAdmin()) {
    return { error: err("FORBIDDEN", "Hanya Superadmin yang dapat mengelola Kepala Ruang", 403) };
  }
  return { user };
}

export async function GET() {
  const gate = await requireSuperAdmin();
  if (gate.error) return gate.error;

  try {
    const [rooms, mappings, candidates] = await Promise.all([
      prisma.room.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true, category: true, subcategory: true },
        orderBy: { name: "asc" },
      }),
      prisma.roomKepalaRuang.findMany({
        select: {
          id: true,
          roomId: true,
          userId: true,
          staffId: true,
          name: true,
          nip: true,
          updatedAt: true,
        },
      }),
      prisma.user.findMany({
        where: {
          isActive: true,
          userRoles: { some: { role: { name: ROLES.KEPALA_RUANG } } },
        },
        select: {
          id: true,
          username: true,
          email: true,
          staff: { select: { id: true, name: true, nip: true, roomId: true } },
        },
        orderBy: { username: "asc" },
      }),
    ]);

    const byRoom = new Map(mappings.map((m) => [m.roomId, m]));
    const data = rooms.map((room) => ({
      ...room,
      kepalaRuang: byRoom.get(room.id) ?? null,
    }));

    return ok({
      rooms: data,
      candidates: candidates.map((c) => ({
        id: c.id,
        username: c.username,
        email: c.email,
        staffId: c.staff?.id ?? null,
        name: c.staff?.name ?? c.username,
        nip: c.staff?.nip ?? null,
      })),
    });
  } catch (e) {
    logServerError("admin-room-kepala-ruang", e);
    return err("LOAD_FAILED", safeErrorMessage("LOAD_FAILED"), 500);
  }
}

const PutSchema = z.object({
  roomId: z.string().min(1),
  userId: z.string().min(1).nullable(),
});

export async function PUT(req: NextRequest) {
  const gate = await requireSuperAdmin();
  if (gate.error) return gate.error;
  const actor = gate.user!;

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(PutSchema, body);
  if (error) return error;

  const room = await prisma.room.findUnique({ where: { id: data.roomId } });
  if (!room) return err("NOT_FOUND", "Ruangan tidak ditemukan", 404);

  try {
    // Clearing the assignment.
    if (data.userId === null) {
      const existing = await prisma.roomKepalaRuang.findUnique({ where: { roomId: room.id } });
      if (existing) {
        await prisma.roomKepalaRuang.delete({ where: { roomId: room.id } });
      }
      await logAudit({
        userId: actor.id,
        module: "admin",
        resource: "room_kepala_ruang",
        resourceId: room.id,
        action: "UPDATED",
        before: existing ? { room: room.name, userId: existing.userId, name: existing.name } : null,
        after: { room: room.name, userId: null },
        ipAddress: clientIp(req),
      });
      return ok({ roomId: room.id, kepalaRuang: null });
    }

    // Resolve the target user and validate the KEPALA_RUANG role.
    const target = await prisma.user.findUnique({
      where: { id: data.userId },
      select: {
        id: true,
        username: true,
        isActive: true,
        staff: { select: { id: true, name: true, nip: true } },
        userRoles: { select: { role: { select: { name: true } } } },
      },
    });
    if (!target) return err("NOT_FOUND", "Pengguna tidak ditemukan", 404);
    if (!target.isActive) {
      return err("INACTIVE_USER", "Pengguna tidak aktif dan tidak dapat ditugaskan", 409);
    }
    const hasKaruRole = target.userRoles.some((ur) => ur.role.name === ROLES.KEPALA_RUANG);
    if (!hasKaruRole) {
      return err(
        "ROLE_REQUIRED",
        "Pengguna harus memiliki peran KEPALA_RUANG sebelum ditugaskan sebagai Kepala Ruang",
        409,
      );
    }

    const name = target.staff?.name ?? target.username;
    const nip = target.staff?.nip ?? null;

    const existing = await prisma.roomKepalaRuang.findUnique({ where: { roomId: room.id } });

    const saved = await prisma.roomKepalaRuang.upsert({
      where: { roomId: room.id },
      update: {
        userId: target.id,
        staffId: target.staff?.id ?? null,
        name,
        nip,
        assignedBy: actor.id,
      },
      create: {
        roomId: room.id,
        userId: target.id,
        staffId: target.staff?.id ?? null,
        name,
        nip,
        assignedBy: actor.id,
      },
    });

    await logAudit({
      userId: actor.id,
      module: "admin",
      resource: "room_kepala_ruang",
      resourceId: room.id,
      action: "UPDATED",
      before: existing ? { room: room.name, userId: existing.userId, name: existing.name } : null,
      after: { room: room.name, userId: saved.userId, name: saved.name, nip: saved.nip },
      ipAddress: clientIp(req),
    });

    return ok({ roomId: room.id, kepalaRuang: saved });
  } catch (e) {
    logServerError("admin-room-kepala-ruang", e);
    return err("UPDATE_FAILED", safeErrorMessage("UPDATE_FAILED"), 500);
  }
}
