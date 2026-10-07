import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { logAudit, clientIp } from "@/lib/audit";
import { USER_API_SELECT } from "@/lib/user-select";

const select = USER_API_SELECT;

const UpdateSchema = z.object({
  username: z.string().trim().min(3).max(50).optional(),
  email: z.string().trim().email("Email tidak valid").max(200).optional(),
  password: z.string().min(8, "Password minimal 8 karakter").max(200).optional(),
  isActive: z.boolean().optional(),
  roles: z.array(z.string()).optional(),
});

async function guard(permission: string) {
  const { authorized, user } = await checkPermission(permission);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);
  return null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(PERMISSIONS.ADMIN_USERS_READ);
  if (denied) return denied;

  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select });
  if (!user) return err("NOT_FOUND", "Pengguna tidak ditemukan", 404);
  return ok({ user });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(PERMISSIONS.ADMIN_USERS_UPDATE);
  if (denied) return denied;
  const actor = (await checkPermission(PERMISSIONS.ADMIN_USERS_UPDATE)).user!;

  const { id } = await params;
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return err("NOT_FOUND", "Pengguna tidak ditemukan", 404);

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(UpdateSchema, body);
  if (error) return error;

  if (data.email && data.email !== existing.email) {
    const dup = await prisma.user.findUnique({ where: { email: data.email } });
    if (dup) {
      return err("DUPLICATE", "Email sudah digunakan", 409, { email: ["Email sudah digunakan"] });
    }
  }
  if (data.username && data.username !== existing.username) {
    const dup = await prisma.user.findUnique({ where: { username: data.username } });
    if (dup) {
      return err("DUPLICATE", "Username sudah digunakan", 409, {
        username: ["Username sudah digunakan"],
      });
    }
  }
  if (id === actor.id && data.isActive === false) {
    return err("SELF_ACTION", "Tidak dapat menonaktifkan akun sendiri", 409);
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const passwordHash = data.password ? await bcrypt.hash(data.password, 12) : undefined;
      const u = await tx.user.update({
        where: { id },
        data: {
          ...(data.username !== undefined ? { username: data.username } : {}),
          ...(data.email !== undefined ? { email: data.email } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(passwordHash ? { passwordHash } : {}),
        },
      });

      if (data.roles) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        for (const roleName of data.roles) {
          const role = await tx.role.findUnique({ where: { name: roleName } });
          if (role) await tx.userRole.create({ data: { userId: id, roleId: role.id } });
        }
      }

      // Password change invalidates existing sessions
      if (passwordHash) {
        await tx.session.deleteMany({ where: { userId: id } });
      }

      return u;
    });

    await logAudit({
      userId: actor.id,
      module: "admin",
      resource: "user",
      resourceId: id,
      action: "UPDATED",
      before: { email: existing.email, username: existing.username, isActive: existing.isActive },
      after: {
        email: data.email ?? existing.email,
        username: data.username ?? existing.username,
        isActive: data.isActive ?? existing.isActive,
        passwordChanged: Boolean(data.password),
        roles: data.roles,
      },
      ipAddress: clientIp(req),
    });

    const full = await prisma.user.findUnique({ where: { id: updated.id }, select });
    return ok({ user: full });
  } catch (e) {
    return err("UPDATE_FAILED", e instanceof Error ? e.message : "Gagal memperbarui pengguna", 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(PERMISSIONS.ADMIN_USERS_DELETE);
  if (denied) return denied;
  const actor = (await checkPermission(PERMISSIONS.ADMIN_USERS_DELETE)).user!;

  const { id } = await params;
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return err("NOT_FOUND", "Pengguna tidak ditemukan", 404);
  if (id === actor.id) return err("SELF_ACTION", "Tidak dapat menghapus akun sendiri", 409);

  try {
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId: id } }),
      prisma.session.deleteMany({ where: { userId: id } }),
      prisma.user.delete({ where: { id } }),
    ]);

    await logAudit({
      userId: actor.id,
      module: "admin",
      resource: "user",
      resourceId: id,
      action: "DELETED",
      before: { username: existing.username, email: existing.email },
      ipAddress: clientIp(_req),
    });

    return ok({ deleted: true });
  } catch {
    return err("DELETE_FAILED", "Gagal menghapus pengguna", 500);
  }
}
