import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { logAudit, clientIp } from "@/lib/audit";

const BodySchema = z.object({
  name: z.string().trim().min(1, "Nama ruangan wajib diisi").max(100),
  code: z.string().trim().max(20).optional(),
});

export async function GET() {
  const { authorized, user } = await checkPermission(PERMISSIONS.ADMIN_SETTINGS);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const rooms = await prisma.room.findMany({ orderBy: { name: "asc" } });
  return ok({ rooms });
}

export async function POST(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.ADMIN_SETTINGS);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(BodySchema, body);
  if (error) return error;

  const existing = await prisma.room.findFirst({ where: { name: { equals: data.name } } });
  if (existing) return err("DUPLICATE", `Ruangan "${data.name}" sudah ada`, 409);

  const autoCode = data.code || data.name.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8);

  try {
    const room = await prisma.room.create({
      data: { name: data.name, code: autoCode },
    });
    await logAudit({
      userId: user.id,
      module: "admin",
      resource: "room",
      resourceId: room.id,
      action: "CREATED",
      after: { name: room.name, code: room.code },
      ipAddress: clientIp(req),
    });
    return ok({ room });
  } catch (e) {
    return err("CREATE_FAILED", e instanceof Error ? e.message : "Gagal menyimpan ruangan", 500);
  }
}
