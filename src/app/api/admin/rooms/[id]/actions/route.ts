import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { logAudit, clientIp } from "@/lib/audit";

const PutSchema = z.object({
  actionIds: z.array(z.string().min(1)).max(500),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.ADMIN_SETTINGS);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return err("NOT_FOUND", "Ruangan tidak ditemukan", 404);

  const links = await prisma.roomNursingAction.findMany({
    where: { roomId: id },
    include: {
      nursingAction: {
        select: { id: true, code: true, name: true, category: true, isActive: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return ok({ room, actions: links.map((l) => l.nursingAction) });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkPermission(PERMISSIONS.ADMIN_SETTINGS);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const { id } = await params;
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return err("NOT_FOUND", "Ruangan tidak ditemukan", 404);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(PutSchema, body);
  if (error) return error;

  const uniqueIds = Array.from(new Set(data.actionIds));
  const existing = await prisma.nursingAction.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true },
  });
  if (existing.length !== uniqueIds.length) {
    return err("ACTION_NOT_FOUND", "Ada tindakan yang tidak ditemukan", 404);
  }

  try {
    const [, , count] = await prisma.$transaction([
      prisma.roomNursingAction.deleteMany({ where: { roomId: id } }),
      prisma.roomNursingAction.createMany({
        data: uniqueIds.map((actionId) => ({ roomId: id, nursingActionId: actionId })),
      }),
      prisma.roomNursingAction.count({ where: { roomId: id } }),
    ]);

    await logAudit({
      userId: user.id,
      module: "borang",
      resource: "room_nursing_action",
      resourceId: id,
      action: "UPDATED",
      after: { room: room.name, actionCount: count },
      ipAddress: clientIp(req),
    });

    return ok({ count });
  } catch (e) {
    return err("UPDATE_FAILED", e instanceof Error ? e.message : "Gagal menyimpan relasi", 500);
  }
}
