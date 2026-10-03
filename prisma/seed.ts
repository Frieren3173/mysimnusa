import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  DOCUMENT_TYPES,
  COMPETENCIES,
} from "../src/lib/constants";

const prisma = new PrismaClient();

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

  // 5. Default Rooms
  console.log("Creating default rooms...");
  const rooms = [
    { name: "IGD", code: "IGD" },
    { name: "ICU", code: "ICU" },
    { name: "Rawat Inap Bedah", code: "RN_BEDAH" },
    { name: "Rawat Inap Penyakit Dalam", code: "RN_PD" },
    { name: "Kamar Operasi (OK)", code: "OK" },
    { name: "VK / Bersalin", code: "VK" },
    { name: "Poli Rawat Jalan", code: "POLI" },
    { name: "Hemodialisa", code: "HD" },
  ];

  for (const r of rooms) {
    const existing = await prisma.room.findFirst({ where: { name: r.name } });
    if (!existing) {
      await prisma.room.create({ data: r });
    }
  }

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

  // 7. Seed sample Staff records
  console.log("Creating sample staff...");
  const igdRoom = await prisma.room.findFirst({ where: { code: "IGD" } });
  const okRoom = await prisma.room.findFirst({ where: { code: "OK" } });

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
      roomId: okRoom?.id,
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
