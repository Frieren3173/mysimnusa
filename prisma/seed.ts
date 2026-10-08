import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";
import {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  DOCUMENT_TYPES,
  COMPETENCIES,
} from "../src/lib/constants";
import { NURSING_ACTIONS, ROOM_ACTION_MAP } from "../src/lib/master-data";
import { CANONICAL_ROOMS, LEGACY_ROOM_NAMES, roomTypeForCategory } from "../src/lib/rooms";

// The schema uses `engineType = "client"`, so a driver adapter is required.
// Prefer the unpooled connection for the seed script (Node.js, single process).
const databaseUrl =
  process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("[seed] DATABASE_URL is not set");
}
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: databaseUrl, max: 3 }),
});

async function main() {
  console.log("Seeding database...");

  // 1. Permissions
  console.log("Creating permissions...");
  for (const [, code] of Object.entries(PERMISSIONS)) {
    const [module, resource, action] = code.split(".");
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, module, resource, action },
    });
  }

  // 2. Roles & Role-Permissions
  console.log("Creating roles and assigning permissions...");
  for (const [roleName, permissionCodes] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: {
        name: roleName,
        description: `Role ${roleName}`,
      },
    });

    for (const code of permissionCodes) {
      const permission = await prisma.permission.findUnique({ where: { code } });
      if (permission) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          update: {},
          create: {
            roleId: role.id,
            permissionId: permission.id,
          },
        });
      }
    }
  }

  // 3. Document Types
  console.log("Creating document types...");
  for (const doc of Object.values(DOCUMENT_TYPES)) {
    await prisma.documentType.upsert({
      where: { code: doc.code },
      update: {},
      create: {
        code: doc.code,
        name: doc.name,
        hasExpiry: doc.hasExpiry,
      },
    });
  }

  // 4. Competencies
  console.log("Creating competencies...");
  for (const comp of COMPETENCIES) {
    await prisma.competency.upsert({
      where: { code: comp.code },
      update: {},
      create: {
        code: comp.code,
        name: comp.name,
      },
    });
  }

  // 5. Canonical Rooms (exactly 17) — reconciled by canonical name.
  //
  // Rooms are added by canonical name and enriched with category/subcategory.
  // Legacy/duplicate room names are never created. Rooms that legitimately
  // exist with staff attached are kept; they are matched by name.
  console.log("Seeding canonical rooms...");
  for (const room of CANONICAL_ROOMS) {
    const existing = await prisma.room.findFirst({ where: { name: room.name } });
    if (existing) {
      await prisma.room.update({
        where: { id: existing.id },
        data: {
          category: room.category,
          subcategory: room.subcategory,
          type: existing.type ?? roomTypeForCategory(room.category, room.subcategory),
          description: existing.description ?? room.description,
          isActive: true,
        },
      });
    } else {
      await prisma.room.create({
        data: {
          name: room.name,
          category: room.category,
          subcategory: room.subcategory,
          type: roomTypeForCategory(room.category, room.subcategory),
          description: room.description,
          isActive: true,
        },
      });
    }
  }

  // Guard: never re-create legacy rooms.
  const legacyPresent = await prisma.room.findMany({
    where: { name: { in: [...LEGACY_ROOM_NAMES] } },
  });
  if (legacyPresent.length > 0) {
    console.warn(
      `  [warn] ${legacyPresent.length} legacy room(s) still present — remove them via migration: ` +
        legacyPresent.map((r) => r.name).join(", "),
    );
  }

  // 5c. Master Tindakan Keperawatan (idempotent — reconciled by name)
  console.log(`Seeding master tindakan (${NURSING_ACTIONS.length})...`);

  // De-duplicate by name first: action identity is the (unique) name. The
  // lowest-code row survives; links and entries of duplicates are re-pointed
  // to the survivor, then the duplicates are removed. No historical data is
  // lost (borangEntries is 0 in production, and links are migrated).
  const allExisting = await prisma.nursingAction.findMany({ orderBy: { code: "asc" } });
  const groups = new Map<string, typeof allExisting>();
  for (const a of allExisting) {
    const list = groups.get(a.name) ?? [];
    list.push(a);
    groups.set(a.name, list);
  }
  let dedupCount = 0;
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    const [survivor, ...dupes] = list;
    const dupeIds = dupes.map((d) => d.id);
    await prisma.borangEntry.updateMany({
      where: { nursingActionId: { in: dupeIds } },
      data: { nursingActionId: survivor.id },
    });
    // Re-point room links, then drop the duplicate links.
    const survivorRooms = await prisma.roomNursingAction.findMany({
      where: { nursingActionId: survivor.id },
      select: { roomId: true },
    });
    const survivorRoomIds = new Set(survivorRooms.map((r) => r.roomId));
    const dupeLinks = await prisma.roomNursingAction.findMany({
      where: { nursingActionId: { in: dupeIds } },
    });
    for (const link of dupeLinks) {
      if (!survivorRoomIds.has(link.roomId)) {
        await prisma.roomNursingAction.update({
          where: { id: link.id },
          data: { nursingActionId: survivor.id },
        });
        survivorRoomIds.add(link.roomId);
      } else {
        await prisma.roomNursingAction.delete({ where: { id: link.id } });
      }
    }
    await prisma.nursingAction.deleteMany({ where: { id: { in: dupeIds } } });
    dedupCount += dupeIds.length;
  }
  if (dedupCount > 0) console.log(`  ${dedupCount} tindakan duplikat (by nama) digabungkan.`);

  const actionIdByName = new Map<string, string>();
  // Action codes are assigned deterministically by catalog order. An action is
  // matched by NAME first so an existing row (any code) is reused instead of
  // creating a duplicate; only genuinely new actions are inserted.
  const catalogNames = new Set<string>();
  for (const [index, action] of NURSING_ACTIONS.entries()) {
    catalogNames.add(action.name);
    const desiredCode = `TA-${String(index + 1).padStart(3, "0")}`;
    const byName = await prisma.nursingAction.findFirst({ where: { name: action.name } });
    const saved = byName
      ? await prisma.nursingAction.update({
          where: { id: byName.id },
          data: { category: action.category, isActive: true },
        })
      : await prisma.nursingAction.upsert({
          where: { code: desiredCode },
          update: { name: action.name, category: action.category, isActive: true },
          create: {
            code: desiredCode,
            name: action.name,
            category: action.category,
            description: action.description ?? null,
          },
        });
    actionIdByName.set(saved.name, saved.id);
  }

  // Deactivate any action no longer in the canonical catalog (never delete,
  // so historical references — if any ever appear — remain intact).
  const stale = await prisma.nursingAction.updateMany({
    where: { name: { notIn: [...catalogNames] } },
    data: { isActive: false },
  });
  if (stale.count > 0) {
    console.log(`  ${stale.count} tindakan lama dinonaktifkan (tidak ada di katalog kanonik).`);
  }
  const actionCount = await prisma.nursingAction.count();
  console.log(`  ${actionCount} tindakan tersimpan (${NURSING_ACTIONS.length} kanonik).`);

  // 5d. Relasi Ruangan ↔ Tindakan (idempotent — unique compound key)
  console.log("Seeding room-action relations...");
  const canonicalRoomsAfterSeed = await prisma.room.findMany();
  const canonicalByName = new Map(canonicalRoomsAfterSeed.map((r) => [r.name, r]));

  for (const [roomName, actionNames] of Object.entries(ROOM_ACTION_MAP)) {
    const room = canonicalByName.get(roomName);
    if (!room) {
      console.warn(`  [skip] ruangan "${roomName}" tidak ditemukan`);
      continue;
    }
    for (const actionName of actionNames) {
      const actionId = actionIdByName.get(actionName);
      if (!actionId) {
        console.warn(`  [skip] tindakan "${actionName}" tidak ditemukan (room ${roomName})`);
        continue;
      }
      await prisma.roomNursingAction.upsert({
        where: {
          roomId_nursingActionId: { roomId: room.id, nursingActionId: actionId },
        },
        update: {},
        create: { roomId: room.id, nursingActionId: actionId },
      });
    }
  }
  const relationCount = await prisma.roomNursingAction.count();
  console.log(`  ${relationCount} relasi ruangan-tindakan tersimpan.`);

  // 6. Super Admin User
  console.log("Creating super admin user...");
  const passwordHash = await bcrypt.hash("Admin123!", 12);
  const superAdmin = await prisma.user.upsert({
    where: { username: "superadmin" },
    update: {},
    create: {
      username: "superadmin",
      email: "admin@rsajt.co.id",
      passwordHash,
      isActive: true,
    },
  });

  const superAdminRole = await prisma.role.findUnique({
    where: { name: ROLES.SUPER_ADMIN },
  });

  if (superAdminRole) {
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: superAdmin.id,
          roleId: superAdminRole.id,
        },
      },
      update: {},
      create: {
        userId: superAdmin.id,
        roleId: superAdminRole.id,
      },
    });
  }

  // 7. Seed sample Staff records — OPT-IN only.
  //
  // The three sample staff (Siti / Dewi / Budi) are placeholders for local
  // development. They must NOT be created in production, so this block runs only
  // when `SEED_SAMPLE_STAFF=1` is set explicitly. Default (unset/0) skips it.
  const seedSampleStaff = process.env.SEED_SAMPLE_STAFF === "1";
  if (!seedSampleStaff) {
    console.log("Sample staff dilewati (set SEED_SAMPLE_STAFF=1 untuk membuat staf contoh).");
  } else {
    console.log("Checking sample staff...");
    const existingStaffCount = await prisma.staff.count();
    if (existingStaffCount === 0) {
      const igdRoom = await prisma.room.findFirst({ where: { name: "IGD" } });
      const ibsRoom = await prisma.room.findFirst({ where: { name: "IBS" } });

      const sampleStaff = [
        {
          nip: "198501152010012001",
          name: "Ns. Siti Rahmawati, S.Kep",
          email: "siti.rahmawati@rsajt.co.id",
          phone: "081234567890",
          profession: "Perawat",
          roomId: igdRoom?.id,
          employmentStatus: "ACTIVE",
        },
        {
          nip: "199003222014022003",
          name: "Bdn. Dewi Lestari, S.Tr.Keb",
          email: "dewi.lestari@rsajt.co.id",
          phone: "081298765432",
          profession: "Bidan",
          roomId: ibsRoom?.id,
          employmentStatus: "ACTIVE",
        },
        {
          nip: "198811052012011002",
          name: "Ns. Budi Santoso, M.Kep",
          email: "budi.santoso@rsajt.co.id",
          phone: "081311223344",
          profession: "Perawat",
          roomId: igdRoom?.id,
          employmentStatus: "ACTIVE",
        },
      ];

      for (const s of sampleStaff) {
        await prisma.staff.upsert({
          where: { nip: s.nip },
          update: {},
          create: s,
        });
      }
    } else {
      console.log(`  ${existingStaffCount} staff sudah ada — seed sample staff dilewati.`);
    }
  }

  console.log("Seeding complete!");
  console.log("Super Admin: username = superadmin, password = Admin123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
