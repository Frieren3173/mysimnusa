import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { StickyPageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/lib/authorization";
import { appShellVisibility } from "@/lib/app-shell-props";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { UsersClient } from "./users-client";

export const metadata: Metadata = { title: "Manajemen Pengguna" };

export default async function AdminUsersPage() {
  const currentUser = await requirePermission(PERMISSIONS.ADMIN_USERS_READ);

  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      include: {
        userRoles: { include: { role: { select: { name: true, description: true } } } },
        staff: { select: { id: true, name: true } },
      },
      orderBy: { username: "asc" },
      take: 100,
    }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
  ]);

  const breadcrumbs = [{ label: "Pengguna" }];

  return (
    <AppShell
      breadcrumbs={breadcrumbs}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Staff",
      }}
      {...appShellVisibility(currentUser)}
    >
      <div className="mx-auto max-w-5xl">
        <StickyPageHeader
          title="Manajemen Pengguna"
          description="Akun, email, peran (role), dan status login. Ubah email bebas — email bukan kunci login."
        />
        <UsersClient initialUsers={users} roles={roles} meId={currentUser.id} />
      </div>
    </AppShell>
  );
}
