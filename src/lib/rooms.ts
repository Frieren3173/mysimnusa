/**
 * MYSIMNUSA — Borang master data (Single Source of Truth).
 *
 * The database is the runtime source of truth: rooms, actions and their
 * relations are read from Prisma. This module defines the *canonical* master
 * set used for seeding/reconciliation and for the small number of places that
 * need the canonical grouping labels.
 *
 * Canonical rooms (exactly 17) and their categories/subcategories.
 */

// ─────────────────────────────────────────────────────────────
// ROOM CATEGORIES (top-level grouping) — final mapping
// ─────────────────────────────────────────────────────────────

export const ROOM_CATEGORIES = [
  "RAWAT INAP",
  "IBS / BEDAH",
  "KEGAWATDARURATAN",
  "RAWAT JALAN",
  "MANAGEMENT",
] as const;

export type RoomCategory = (typeof ROOM_CATEGORIES)[number];

// ─────────────────────────────────────────────────────────────
// CANONICAL ROOMS — exactly 17
// ─────────────────────────────────────────────────────────────

export interface CanonicalRoom {
  /** Canonical name — SOURCE OF TRUTH, no aliases. */
  name: string;
  category: RoomCategory;
  subcategory: string | null;
  /** Short display description. */
  description: string;
}

export const CANONICAL_ROOMS: CanonicalRoom[] = [
  // RAWAT INAP
  { name: "KRIS LANTAI 4", category: "RAWAT INAP", subcategory: null, description: "Rawat inap KRIS lantai 4" },
  { name: "KRIS LANTAI 5", category: "RAWAT INAP", subcategory: null, description: "Rawat inap KRIS lantai 5" },
  { name: "FORKLIN", category: "RAWAT INAP", subcategory: null, description: "Ruang rawat inap FORKLIN" },
  { name: "VK/KEBIDANAN", category: "RAWAT INAP", subcategory: "KEBIDANAN", description: "Ruang bersalin & kebidanan" },
  { name: "ISOLASI", category: "RAWAT INAP", subcategory: null, description: "Ruang rawat inap isolasi" },
  { name: "VIP", category: "RAWAT INAP", subcategory: null, description: "Ruang rawat inap VIP" },
  { name: "HD", category: "RAWAT INAP", subcategory: "HEMODIALISA", description: "Unit hemodialisa" },

  // IBS / BEDAH
  { name: "IBS", category: "IBS / BEDAH", subcategory: "BEDAH / OPERASI", description: "Instalasi Bedah Sentral" },
  { name: "CATHLAB", category: "IBS / BEDAH", subcategory: "KATETERISASI / CARDIAC PROCEDURE", description: "Unit kateterisasi jantung" },

  // KEGAWATDARURATAN
  { name: "IGD", category: "KEGAWATDARURATAN", subcategory: "IGD", description: "Instalasi Gawat Darurat" },
  { name: "ICU", category: "KEGAWATDARURATAN", subcategory: "ICU", description: "Intensive Care Unit" },
  { name: "PICU", category: "KEGAWATDARURATAN", subcategory: "PICU", description: "Pediatric Intensive Care Unit" },
  { name: "NICU/PERINA", category: "KEGAWATDARURATAN", subcategory: "NICU / PERINATOLOGI", description: "Perawatan intensif neonatus & perinatologi" },
  { name: "PONEK", category: "KEGAWATDARURATAN", subcategory: "OBSTETRI & NEONATAL EMERGENCY", description: "Pelayanan obstetri & neonatal emergensi" },

  // RAWAT JALAN
  { name: "POLI", category: "RAWAT JALAN", subcategory: "RAWAT JALAN", description: "Pelayanan poliklinik (rawat jalan)" },

  // MANAGEMENT
  { name: "PPI", category: "MANAGEMENT", subcategory: "PPI", description: "Pencegahan & Pengendalian Infeksi" },
  { name: "KOMITE KEPERAWATAN", category: "MANAGEMENT", subcategory: "KOMITE / KREDENSIAL / MUTU", description: "Komite Keperawatan" },
];

/** Convenience lookup: canonical name -> canonical room. */
export const CANONICAL_ROOM_BY_NAME = new Map(CANONICAL_ROOMS.map((r) => [r.name, r]));

// Legacy room names that must never reappear (guards against re-seeding).
export const LEGACY_ROOM_NAMES = [
  "Rawat Inap Bedah",
  "Rawat Inap Penyakit Dalam",
  "Kamar Operasi (OK)",
  "Rawat Inap 1",
  "Intensive Cardiac Care Unit",
  "Neonatal Intensive Care Unit",
  "Pediatric Intensive Care Unit",
  "Instalasi Bedah Sentral",
  "Recovery Room",
  "VK / Bersalin",
  "Ruang Nifas",
  "Hemodialisa",
  "Poli Rawat Jalan",
  "Pelayanan Obstetri Neonatal Emergensi",
] as const;

// ─────────────────────────────────────────────────────────────
// ROOM TYPE (legacy column) — derived from category, kept in sync
// ─────────────────────────────────────────────────────────────

export const ROOM_TYPES = [
  "IGD",
  "Rawat Inap",
  "ICU",
  "Kamar Operasi",
  "Kebidanan",
  "Rawat Jalan",
  "Khusus",
  "Lainnya",
] as const;

/** Maps a canonical category (+ subcategory) to the legacy `type` column. */
export function roomTypeForCategory(category: string, subcategory: string | null): string {
  switch (category) {
    case "RAWAT INAP":
      if (subcategory === "KEBIDANAN") return "Kebidanan";
      if (subcategory === "HEMODIALISA") return "Khusus";
      return "Rawat Inap";
    case "IBS / BEDAH":
      return "Kamar Operasi";
    case "KEGAWATDARURATAN":
      if (subcategory === "OBSTETRI & NEONATAL EMERGENCY") return "Kebidanan";
      return subcategory === "IGD" ? "IGD" : "ICU";
    case "RAWAT JALAN":
      return "Rawat Jalan";
    case "MANAGEMENT":
      return "Khusus";
    default:
      return "Lainnya";
  }
}
