import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { logAudit, clientIp } from "@/lib/audit";
import { logServerError, safeErrorMessage } from "@/lib/logger";

const BodySchema = z.object({
  name: z.string().trim().min(1, "Nama kompetensi wajib diisi").max(100),
});

export async function GET() {
  const { authorized, user } = await checkPermission(PERMISSIONS.ADMIN_SETTINGS);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const competencies = await prisma.competency.findMany({ orderBy: { name: "asc" } });
  return ok({ competencies });
}

export async function POST(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.ADMIN_SETTINGS);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(BodySchema, body);
  if (error) return error;

  const code = data.name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
  if (!code) return err("INVALID_NAME", "Nama harus mengandung huruf/angka", 422);

  const existing = await prisma.competency.findFirst({
    where: { OR: [{ code }, { name: { equals: data.name } }] },
  });
  if (existing) return err("DUPLICATE", `Kompetensi "${data.name}" sudah ada`, 409);

  try {
    const competency = await prisma.competency.create({
      data: { code, name: data.name },
    });
    await logAudit({
      userId: user.id,
      module: "admin",
      resource: "competency",
      resourceId: competency.id,
      action: "CREATED",
      after: { code, name: data.name },
      ipAddress: clientIp(req),
    });
    return ok({ competency });
  } catch (e) {
    logServerError("admin-competencies", e);
    return err("CREATE_FAILED", safeErrorMessage("CREATE_FAILED"), 500);
  }
}
