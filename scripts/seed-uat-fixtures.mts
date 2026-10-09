/**
 * UAT fixtures — STAGING ONLY.
 *
 * Provisions the five business-role test accounts and a couple of Room → Kepala
 * Ruang mappings on the isolated Neon staging branch. Refuses to run unless the
 * target host matches the known staging compute, so it can never touch
 * production.
 *
 * Test accounts (all share one password, set via env or default):
 *   uat.superadmin  → SUPERADMIN            (already exists as `superadmin`)
 *   uat.komite      → KOMITE_KEPERAWATAN_KEBIDANAN
 *   uat.diklat      → DIKLAT_BORANG
 *   uat.user        → USER                   (linked to a room)
 *   uat.karu        → KEPALA_RUANG           (linked to a room)
 */
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!;
const host = new URL(url).hostname;
const STAGING_HOST = process.env.STAGING_DB_HOST ?? "";
if (!STAGING_HOST || host !== STAGING_HOST) {
  console.error(`[uat-fixtures] Refused: host "${host}" != STAGING_DB_HOST "${STAGING_HOST}"`);
  process.exit(1);
}
const PASS = process.env.UAT_PASSWORD || "UatTest1234!";
const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url, max: 3 }) });

async function ensureUser(username: string, email: string, roleName: string, staffId?: string) {
  const passwordHash = await bcrypt.hash(PASS, 12);
  const u = await p.user.upsert({
    where: { username },
    update: { isActive: true, passwordHash },
    create: { username, email, passwordHash, isActive: true },
  });
  const role = await p.role.findUnique({ where: { name: roleName } });
  if (!role) throw new Error(`role ${roleName} not found`);
  await p.userRole.deleteMany({ where: { userId: u.id } });
  await p.userRole.create({ data: { userId: u.id, roleId: role.id } });
  if (staffId) {
    await p.staff.updateMany({ where: { userId: u.id }, data: { userId: null } });
    await p.staff.update({ where: { id: staffId }, data: { userId: u.id } });
  }
  return u;
}

async function main() {
  console.log(`[uat-fixtures] staging host OK: ${host}`);

  const rooms = await p.room.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  const roomA = rooms.find((r) => r.name === "ICU") ?? rooms[0];
  const roomB = rooms.find((r) => r.name === "IGD") ?? rooms[1];
  if (!roomA || !roomB) throw new Error("need 2 rooms");

  // Pick unlinked staff rows for the linked accounts.
  const staffPool = await p.staff.findMany({ where: { isActive: true, userId: null }, take: 20, orderBy: { name: "asc" } });
  const staffUser = staffPool[0];
  const staffKaru = staffPool[1];
  if (!staffUser || !staffKaru) throw new Error("need 2 unlinked staff rows");

  // Ensure the two chosen staff are in the respective rooms so room scoping is meaningful.
  await p.staff.update({ where: { id: staffUser.id }, data: { roomId: roomA.id } });
  await p.staff.update({ where: { id: staffKaru.id }, data: { roomId: roomA.id } });

  const superadmin = await ensureUser("superadmin", "admin@rsajt.co.id", "SUPERADMIN");
  const komite = await ensureUser("uat.komite", "uat.komite@uat.local", "KOMITE_KEPERAWATAN_KEBIDANAN");
  const diklat = await ensureUser("uat.diklat", "uat.diklat@uat.local", "DIKLAT_BORANG");
  const userAcc = await ensureUser("uat.user", "uat.user@uat.local", "USER", staffUser.id);
  const karu = await ensureUser("uat.karu", "uat.karu@uat.local", "KEPALA_RUANG", staffKaru.id);

  // Room → Kepala Ruang mapping: roomA mapped to uat.karu; roomB intentionally unmapped.
  await p.roomKepalaRuang.upsert({
    where: { roomId: roomA.id },
    update: { userId: karu.id, staffId: staffKaru.id, name: staffKaru.name, nip: staffKaru.nip },
    create: { roomId: roomA.id, userId: karu.id, staffId: staffKaru.id, name: staffKaru.name, nip: staffKaru.nip },
  });
  await p.roomKepalaRuang.deleteMany({ where: { roomId: roomB.id } });

  console.log("[uat-fixtures] accounts:");
  console.log(`  superadmin  | SUPERADMIN                     | ${superadmin.username}`);
  console.log(`  uat.komite  | KOMITE_KEPERAWATAN_KEBIDANAN   | ${komite.username}`);
  console.log(`  uat.diklat  | DIKLAT_BORANG                  | ${diklat.username}`);
  console.log(`  uat.user    | USER                           | ${userAcc.username}`);
  console.log(`  uat.karu    | KEPALA_RUANG                   | ${karu.username}`);
  console.log(`[uat-fixtures] mapped room (KARU): ${roomA.name} (${roomA.id})`);
  console.log(`[uat-fixtures] unmapped room (negative test): ${roomB.name} (${roomB.id})`);
  console.log(`[uat-fixtures] password: ${PASS === "UatTest1234!" ? "(default, see script)" : "(from env)"}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => p.$disconnect());
