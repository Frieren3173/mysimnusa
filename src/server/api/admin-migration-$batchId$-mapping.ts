import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, err, parseBody } from "@/lib/api";
import { requireMigrationUser } from "@/lib/migration/auth";
import { logServerError, safeErrorMessage } from "@/lib/logger";

const STAFF_TARGETS = [
  "staff.name",
  "staff.nip",
  "staff.email",
  "staff.phone",
  "staff.address",
  "staff.dateOfBirth",
  "staff.profession",
  "staff.room",
  "staff.photoUrl",
  "education.level",
];

const TargetSchema = z
  .string()
  .refine(
    (t) =>
      t === "" ||
      STAFF_TARGETS.includes(t) ||
      /^document\.[A-Z0-9_]+\.(file|expiry|expiryAlt|number)$/.test(t) ||
      /^competency\.[A-Z0-9_]+$/.test(t),
    { message: "Target field tidak dikenal" }
  );

const BodySchema = z.object({
  mappings: z
    .array(
      z.object({
        sourceField: z.string().min(1),
        targetField: TargetSchema,
        isIgnored: z.boolean().default(false),
      })
    )
    .min(1),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  const { batchId } = await params;
  const batch = await prisma.migrationBatch.findUnique({ where: { id: batchId } });
  if (!batch) return err("NOT_FOUND", "Batch tidak ditemukan", 404);
  if (!["MAPPING_REVIEW", "READY", "SCANNED"].includes(batch.status)) {
    return err("INVALID_STATUS", `Status "${batch.status}" tidak dapat mengubah pemetaan`, 409);
  }

  const body = await req.json().catch(() => null);
  const { data, error } = parseBody(BodySchema, body);
  if (error) return error;

  try {
    for (const m of data.mappings) {
      const targetField = m.isIgnored ? "" : m.targetField;
      await prisma.migrationFieldMapping.upsert({
        where: { batchId_sourceField: { batchId, sourceField: m.sourceField } },
        update: { targetField, isIgnored: m.isIgnored },
        create: { batchId, sourceField: m.sourceField, targetField, isIgnored: m.isIgnored },
      });
    }

    const mappings = await prisma.migrationFieldMapping.findMany({
      where: { batchId },
      orderBy: { sourceField: "asc" },
    });
    return ok({ mappings });
  } catch (e) {
    logServerError("admin-migration-$batchId$-mapping", e);
    return err("SAVE_FAILED", safeErrorMessage("SAVE_FAILED"), 500);
  }
}
