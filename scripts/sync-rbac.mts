/**
 * Idempotent sync of RBAC reference data: permissions, roles, and
 * role-permission links.
 *
 * ADDITIVE / SAFE:
 *   • Upserts permissions (create-if-missing).
 *   • Upserts roles (create-if-missing) — never deletes a role or role-permission.
 *   • Adds missing role→permission links.
 *   • Never touches users, user_roles, staff, rooms, or any business data.
 *
 * This exists so the new business roles (SUPERADMIN, KOMITE_KEPERAWATAN_KEBIDANAN,
 * DIKLAT_BORANG, USER, KEPALA_RUANG) and the additive borang.* permissions can be
 * provisioned without running the full seed (which also touches master data).
 *
 * Guard (mirrors prisma/seed.ts):
 *   ALLOW_RBAC_SYNC=1  and  CONFIRM_DB_HOST=<host of DATABASE_URL>
 *
 * Usage:
 *   $env:ALLOW_RBAC_SYNC=1; $env:CONFIRM_DB_HOST="<host>"; npx tsx scripts/sync-rbac.mts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../src/lib/constants";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("[sync-rbac] DATABASE_URL is required.");
  process.exit(1);
}

if (process.env.ALLOW_RBAC_SYNC !== "1") {
  console.error("[sync-rbac] Refused: set ALLOW_RBAC_SYNC=1 to confirm.");
  process.exit(1);
}
let host = "";
try {
  host = new URL(url).hostname;
} catch {
  console.error("[sync-rbac] Refused: DATABASE_URL is not a valid URL.");
  process.exit(1);
}
if ((process.env.CONFIRM_DB_HOST ?? "").trim() !== host) {
  console.error("[sync-rbac] Refused: CONFIRM_DB_HOST must equal the target DB host.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url, max: 3 }) });

async function main() {
  console.log(`[sync-rbac] target host: ${host}`);

  // 1. Permissions
  let permCount = 0;
  for (const code of Object.values(PERMISSIONS)) {
    const [module, resource, action] = code.split(".");
    await prisma.permission.upsert({
      where: { code },
      update: { module, resource, action },
      create: { code, module, resource, action },
    });
    permCount++;
  }
  console.log(`[sync-rbac] permissions ensured: ${permCount}`);

  // 2. Roles + links
  let roleCount = 0;
  let linkCount = 0;
  for (const [roleName, permissionCodes] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName, description: `Role ${roleName}` },
    });
    roleCount++;

    for (const code of permissionCodes) {
      const permission = await prisma.permission.findUnique({ where: { code } });
      if (!permission) continue;
      const existing = await prisma.rolePermission.findUnique({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      });
      if (!existing) {
        await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: permission.id },
        });
        linkCount++;
      }
    }
  }
  console.log(`[sync-rbac] roles ensured: ${roleCount}`);
  console.log(`[sync-rbac] new role-permission links added: ${linkCount}`);
  console.log("[sync-rbac] done.");
}

main()
  .catch((e) => {
    console.error("[sync-rbac] failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
