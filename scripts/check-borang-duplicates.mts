/**
 * READ-ONLY duplicate audit for Borang RM / patient identifiers.
 *
 * This script NEVER writes or deletes anything. It scans production data and
 * reports, per year:
 *   • duplicate `rmNumber` values
 *   • duplicate `patientIdentifier` values
 *
 * Run before adding any unique constraint so migration safety can be judged:
 *
 *   npx tsx scripts/check-borang-duplicates.mts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL (or DATABASE_URL_UNPOOLED) is required.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });

type DupGroup = { value: string; count: number; entries: string[] };

async function duplicatesByYear(
  field: "rmNumber" | "patientIdentifier",
): Promise<Map<string, DupGroup[]>> {
  const rows = await prisma.borangEntry.findMany({
    select: { id: true, period: true, rmNumber: true, patientIdentifier: true },
    orderBy: { period: "asc" },
  });

  const perYear = new Map<string, Map<string, string[]>>();
  for (const row of rows) {
    const year = (row.period ?? "").slice(0, 4) || "????";
    const value = field === "rmNumber" ? row.rmNumber : row.patientIdentifier;
    if (!value) continue;
    if (!perYear.has(year)) perYear.set(year, new Map());
    const bucket = perYear.get(year)!;
    if (!bucket.has(value)) bucket.set(value, []);
    bucket.get(value)!.push(row.id);
  }

  const result = new Map<string, DupGroup[]>();
  for (const [year, bucket] of perYear) {
    const dups: DupGroup[] = [];
    for (const [value, ids] of bucket) {
      if (ids.length > 1) dups.push({ value, count: ids.length, entries: ids });
    }
    if (dups.length > 0) result.set(year, dups);
  }
  return result;
}

async function main() {
  const total = await prisma.borangEntry.count();
  console.log(`Total BorangEntry rows: ${total}\n`);

  for (const field of ["rmNumber", "patientIdentifier"] as const) {
    const dups = await duplicatesByYear(field);
    console.log(`── Duplicate ${field} per year ──`);
    if (dups.size === 0) {
      console.log("  (none)\n");
      continue;
    }
    let totalDupValues = 0;
    let totalDupRows = 0;
    for (const [year, groups] of [...dups.entries()].sort()) {
      totalDupValues += groups.length;
      totalDupRows += groups.reduce((n, g) => n + g.count, 0);
      console.log(`  ${year}: ${groups.length} duplicated value(s)`);
      for (const g of groups.slice(0, 10)) {
        console.log(`      ${g.value} ×${g.count} → ${g.entries.join(", ")}`);
      }
      if (groups.length > 10) console.log(`      … and ${groups.length - 10} more`);
    }
    console.log(`  TOTAL: ${totalDupValues} duplicated value(s), ${totalDupRows} rows affected\n`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Audit failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
