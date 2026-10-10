import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

/**
 * OPTIONAL staging integration test — proves the DATABASE constraints that the
 * unit/route tests can only emulate:
 *   • C2: the (trainingId, staffId, date) unique index is enforced by the DB.
 *   • C3: keep the naming/behaviour aligned (the route logic is covered by the
 *         in-memory tests; here we only prove the physical unique index).
 *
 * It is SKIPPED by default and ONLY runs when explicitly enabled AND the target
 * host is the known isolated staging compute — it must never touch production.
 *
 *   $env:DIKLAT_STAGING_TEST = "1"
 *   $env:DATABASE_URL_UNPOOLED = "<staging url>"
 *   npx vitest run tests/diklat-integration-staging.test.ts
 */

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "";
const host = url ? new URL(url).hostname : "";
const isStaging = host.includes("ep-flat-shadow");
const enabled = process.env.DIKLAT_STAGING_TEST === "1" && isStaging;

describe.skipIf(!enabled)("staging integration — physical unique constraints", () => {
  let prisma: PrismaClient;
  const trainingTitle = `ITEST-${Date.now()}`;
  let trainingId = "";
  let staffA = "";
  let staffB = "";

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
    const staff = await prisma.staff.findMany({ where: { isActive: true }, take: 2, select: { id: true } });
    staffA = staff[0].id;
    staffB = staff[1].id;
    const t = await prisma.training.create({
      data: { title: trainingTitle, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-01"), status: "COMPLETED" },
    });
    trainingId = t.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (trainingId) {
      await prisma.trainingAttendance.deleteMany({ where: { trainingId } });
      await prisma.trainingAssessment.deleteMany({ where: { trainingId } });
      await prisma.trainingParticipant.deleteMany({ where: { trainingId } });
      await prisma.certificate.deleteMany({ where: { trainingId } });
      await prisma.training.deleteMany({ where: { id: trainingId } });
    }
    await prisma.$disconnect();
  });

  it("C2: a duplicate (training, staff, date) INSERT raises P2002", async () => {
    const date = new Date("2026-08-01T00:00:00.000Z");
    await prisma.trainingAttendance.create({ data: { trainingId, staffId: staffA, date, status: "HADIR" } });
    let code: string | undefined;
    try {
      await prisma.trainingAttendance.create({ data: { trainingId, staffId: staffA, date, status: "SAKIT" } });
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe("P2002");
    const count = await prisma.trainingAttendance.count({ where: { trainingId, staffId: staffA } });
    expect(count).toBe(1);
  });

  it("C2: distinct participants on the same day both persist (no false collision)", async () => {
    const date = new Date("2026-08-02T00:00:00.000Z");
    await prisma.trainingAttendance.create({ data: { trainingId, staffId: staffA, date, status: "HADIR" } });
    await prisma.trainingAttendance.create({ data: { trainingId, staffId: staffB, date, status: "HADIR" } });
    const count = await prisma.trainingAttendance.count({ where: { trainingId, date } });
    expect(count).toBe(2);
  });
});
