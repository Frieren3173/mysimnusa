import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody, PaginationSchema, paginate } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { StaffSchema } from "@/lib/schemas/staff";
import { logAudit, clientIp } from "@/lib/audit";
import type { Prisma } from "@prisma/client";
import { logServerError, safeErrorMessage } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.KOMITE_STAFF_READ);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const url = new URL(req.url);
  const parsed = PaginationSchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    perPage: url.searchParams.get("perPage") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
    sortBy: url.searchParams.get("sortBy") ?? undefined,
    sortOrder: url.searchParams.get("sortOrder") ?? undefined,
  });
  const params = parsed.success
    ? parsed.data
    : { page: 1, perPage: 20, sortOrder: "asc" as const };

  const search = typeof params.search === "string" ? params.search.trim() : "";
  const profession = url.searchParams.get("profession")?.trim() ?? "";
  const status = url.searchParams.get("status")?.trim() ?? "";
  const room = url.searchParams.get("room")?.trim() ?? "";

  const where: Prisma.StaffWhereInput = {};
  if (search) {
    // Case-insensitive across the fields a user expects to search by.
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { nip: { contains: search, mode: "insensitive" } },
      { profession: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      { room: { is: { name: { contains: search, mode: "insensitive" } } } },
    ];
  }
  if (profession) where.profession = profession;
  if (status) where.employmentStatus = status;
  if (room) where.roomId = room;

  const [total, data] = await Promise.all([
    prisma.staff.count({ where }),
    prisma.staff.findMany({
      where,
      include: {
        room: true,
        documents: {
          where: { documentType: { code: "FOTO" } },
          select: { id: true, documentType: { select: { code: true } } },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
    }),
  ]);

  return ok(paginate(data, total, { ...params, sortOrder: params.sortOrder ?? "asc" }));
}

export async function POST(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.KOMITE_STAFF_CREATE);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(StaffSchema, body);
  if (error) return error;

  if (data.nip) {
    const existing = await prisma.staff.findUnique({ where: { nip: data.nip } });
    if (existing) {
      return err("DUPLICATE_NIP", `NIP sudah terdaftar atas nama "${existing.name}"`, 409, {
        nip: ["NIP sudah digunakan"],
      });
    }
  }

  try {
    const staff = await prisma.$transaction(async (tx) => {
      const created = await tx.staff.create({
        data: {
          name: data.name,
          nip: data.nip,
          email: data.email,
          phone: data.phone,
          address: data.address,
          dateOfBirth: data.dateOfBirth,
          profession: data.profession,
          roomId: data.roomId || null,
          employmentStatus: data.employmentStatus,
          isActive: data.isActive,
        },
      });

      if (data.education && data.education.length > 0) {
        await tx.staffEducation.createMany({
          data: data.education.map((e) => ({
            staffId: created.id,
            level: e.level,
            institution: e.institution,
            major: e.major,
            graduationYear: e.graduationYear ?? null,
          })),
        });
      }

      if (data.competencies && data.competencies.length > 0) {
        for (const code of data.competencies) {
          const competency = await tx.competency.upsert({
            where: { code },
            update: {},
            create: { code, name: code.charAt(0) + code.slice(1).toLowerCase() },
          });
          await tx.staffCompetency.upsert({
            where: { staffId_competencyId: { staffId: created.id, competencyId: competency.id } },
            update: {},
            create: { staffId: created.id, competencyId: competency.id },
          });
        }
      }

      return created;
    });

    await logAudit({
      userId: user.id,
      module: "komite",
      resource: "staff",
      resourceId: staff.id,
      action: "CREATED",
      after: { name: staff.name, nip: staff.nip, profession: staff.profession },
      ipAddress: clientIp(req),
    });
    return ok({ staff });
  } catch (e) {
    logServerError("komite-staff", e);
    return err("CREATE_FAILED", safeErrorMessage("CREATE_FAILED"), 500);
  }
}
