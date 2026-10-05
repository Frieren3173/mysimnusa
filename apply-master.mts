import { prisma } from "@/lib/prisma";
import { googleFetch } from "@/lib/google/auth";
import { autoMapColumn, normalizeName } from "@/lib/migration/source";

/**
 * PHASE 2 — MASTER DATA CORRECTION (profession + room assignment).
 *
 * Excel is authoritative. Targeted updates only:
 *   - Staff.profession from Excel "PROFESI" (trim + collapse whitespace, uppercase)
 *   - Staff.roomId from Excel "RUANGAN" where it differs
 * Idempotent: a second run produces no additional changes.
 * No Documents / Drive / migration batches touched.
 */

const SHEET_ID = process.env.LEGACY_SHEET_ID!;
const SHEETS = (process.env.LEGACY_SHEET_NAMES ?? "Form Responses 1,Form Responses 2").split(",");
const APPLY = process.env.APPLY === "1";

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const key = (s: string | null | undefined) => norm(s).toUpperCase();

// Excel → {profession, room} per normalized staff key
type Src = { profession: string; room: string };
const byNip = new Map<string, Src>();
const byName = new Map<string, Src>();

for (const sheetName of SHEETS) {
  const res = await googleFetch("SOURCE", `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}`);
  if (!res.ok) continue;
  const values: string[][] = ((await res.json()) as { values?: string[][] }).values ?? [];
  if (values.length < 2) continue;
  const headers = values[0];
  const m = headers.map((h, i) => ({ i, target: autoMapColumn(h).target }));
  const nipIdx = m.find((x) => x.target === "staff.nip")?.i ?? -1;
  const nameIdx = m.find((x) => x.target === "staff.name")?.i ?? -1;
  const profIdx = m.find((x) => x.target === "staff.profession")?.i ?? -1;
  const roomIdx = m.find((x) => x.target === "staff.room")?.i ?? -1;

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (!row || !row.some((v) => norm(v))) continue;
    const nip = nipIdx >= 0 ? norm(row[nipIdx]) : "";
    const name = nameIdx >= 0 ? norm(row[nameIdx]) : "";
    const profession = profIdx >= 0 ? key(row[profIdx]) : "";
    const room = roomIdx >= 0 ? norm(row[roomIdx]) : "";
    // Merge instead of overwrite: a sheet that lacks a column must not erase a
    // value supplied by another sheet (Form Responses 2 has no PROFESI/RUANGAN).
    const merge = (map: Map<string, Src>, k: string) => {
      const prev = map.get(k) ?? { profession: "", room: "" };
      map.set(k, {
        profession: profession || prev.profession,
        room: room || prev.room,
      });
    };
    if (nip) merge(byNip, nip);
    if (name) merge(byName, normalizeName(name));
  }
}

const staff = await prisma.staff.findMany({ select: { id: true, nip: true, name: true, profession: true, roomId: true } });
const rooms = await prisma.room.findMany({ select: { id: true, name: true } });
const roomByKey = new Map(rooms.map((r) => [key(r.name), r.id]));

const profUpdates: { id: string; from: string; to: string }[] = [];
const roomUpdates: { id: string; name: string; from: string | null; to: string }[] = [];
let noSrc = 0;

for (const s of staff) {
  // Resolve the authoritative source row. NIP is preferred, but a sheet without
  // a PROFESI/RUANGAN column (or with a stale NIP) must not shadow the row that
  // actually carries the value, so we also consult the normalized-name index and
  // take whichever entry has data for the field being corrected.
  const byNipHit = s.nip ? byNip.get(s.nip) : undefined;
  const byNameHit = byName.get(normalizeName(s.name));
  const src: Src = {
    profession: byNipHit?.profession || byNameHit?.profession || "",
    room: byNipHit?.room || byNameHit?.room || "",
  };
  if (!byNipHit && !byNameHit) { noSrc++; continue; }

  // Profession: only when Excel provides a value
  if (src.profession && key(s.profession) !== src.profession) {
    profUpdates.push({ id: s.id, from: s.profession, to: src.profession });
  }

  // Room: only when Excel provides a value and it maps to a known room
  if (src.room) {
    const targetRoomId = roomByKey.get(key(src.room));
    if (targetRoomId && targetRoomId !== s.roomId) {
      const fromName = rooms.find((r) => r.id === s.roomId)?.name ?? null;
      roomUpdates.push({ id: s.id, name: s.name, from: fromName, to: src.room });
    }
  }
}

console.log(`APPLY: ${APPLY}`);
console.log(`Staff scanned: ${staff.length} | without Excel source row: ${noSrc}`);
console.log(`\nPROFESSION updates: ${profUpdates.length}`);
const profCounts = new Map<string, number>();
for (const u of profUpdates) profCounts.set(u.to, (profCounts.get(u.to) ?? 0) + 1);
[...profCounts.entries()].forEach(([k, v]) => console.log(`  → ${k}: ${v}`));

console.log(`\nROOM updates: ${roomUpdates.length}`);
roomUpdates.slice(0, 12).forEach((u) => console.log(`  ${u.name.slice(0,30).padEnd(32)} "${u.from ?? "(none)"}" → "${u.to}"`));

if (APPLY) {
  // Batched updates (grouped by target value) — avoids per-row transaction
  // timeouts and is fully idempotent.
  const byTarget = new Map<string, string[]>();
  for (const u of profUpdates) {
    const arr = byTarget.get(u.to) ?? [];
    arr.push(u.id);
    byTarget.set(u.to, arr);
  }
  for (const [prof, ids] of byTarget) {
    await prisma.staff.updateMany({ where: { id: { in: ids } }, data: { profession: prof } });
  }
  for (const u of roomUpdates) {
    const roomId = roomByKey.get(key(u.to))!;
    await prisma.staff.update({ where: { id: u.id }, data: { roomId } });
  }
  console.log(`\nAPPLIED ${profUpdates.length} profession + ${roomUpdates.length} room updates`);
}
await prisma.$disconnect();
