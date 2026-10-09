/**
 * Sidebar navigation definition + visibility rules (pure, testable).
 *
 * Kept free of React/Next imports so the visibility logic can be unit-tested.
 * The sidebar component maps `icon` keys to lucide icons at render time.
 *
 * Visibility is *menu only*: every route independently enforces access
 * server-side. Items backed by a permission-gated page declare that
 * `permission` so the menu can never show a link the page would reject.
 */

export type NavIconKey =
  | "dashboard"
  | "komite"
  | "borang"
  | "diklat"
  | "administrasi"
  | "pengaturan";

export interface NavItem {
  label: string;
  href?: string;
  icon?: NavIconKey;
  children?: NavItem[];
  /** Roles allowed to see this item (used only when `permission` is absent). */
  roles?: string[];
  /** Permission required to see this item. Mirrors the page gate. */
  permission?: string;
}

const R = {
  SUPER_ADMIN: "SUPER_ADMIN",
  SUPERADMIN: "SUPERADMIN",
  ADMIN_KOMITE: "ADMIN_KOMITE",
  ADMIN_BORANG: "ADMIN_BORANG",
  ADMIN_DIKLAT: "ADMIN_DIKLAT",
  VERIFIER: "VERIFIER",
  KOMITE: "KOMITE_KEPERAWATAN_KEBIDANAN",
  DIKLAT_BORANG: "DIKLAT_BORANG",
  USER: "USER",
  KEPALA_RUANG: "KEPALA_RUANG",
} as const;

const SUPER_ROLES = [R.SUPER_ADMIN, R.SUPERADMIN];
const DIKLAT_ROLES = [...SUPER_ROLES, R.ADMIN_DIKLAT, R.DIKLAT_BORANG];

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: "dashboard",
  },
  {
    label: "Komite Keperawatan dan Kebidanan",
    icon: "komite",
    permission: "komite.staff.read",
    children: [
      { label: "Dashboard", href: "/komite", permission: "komite.staff.read" },
      { label: "Data SDM", href: "/komite/staff", permission: "komite.staff.read" },
      { label: "Legalitas", href: "/komite/legalitas", permission: "komite.license.read" },
      { label: "Kompetensi", href: "/komite/kompetensi", permission: "komite.competency.read" },
      { label: "Dokumen", href: "/komite/dokumen", permission: "komite.document.read" },
    ],
  },
  {
    label: "Borang",
    icon: "borang",
    permission: "borang.logbook.read",
    children: [
      { label: "Dashboard", href: "/borang", permission: "borang.logbook.read" },
      { label: "Logbook", href: "/borang/logbook", permission: "borang.logbook.read" },
      { label: "Input Borang", href: "/borang/entry", permission: "borang.logbook.create" },
      { label: "Review Kepala Ruang", href: "/borang/review", permission: "borang.karu.review" },
      { label: "Sekretariat", href: "/borang/secretariat", permission: "borang.admin.review" },
      { label: "Cetak & Selesai", href: "/borang/print", permission: "borang.press.print" },
      { label: "Verifikasi", href: "/borang/verification", roles: [...SUPER_ROLES, R.ADMIN_BORANG, R.VERIFIER] },
      { label: "Arsip", href: "/borang/archive", roles: [...SUPER_ROLES, R.ADMIN_BORANG, R.VERIFIER] },
      { label: "Master Ruangan", href: "/borang/master/ruangan", permission: "admin.settings.manage" },
      { label: "Master Tindakan", href: "/borang/master/tindakan", permission: "admin.settings.manage" },
    ],
  },
  {
    label: "Diklat",
    icon: "diklat",
    roles: DIKLAT_ROLES,
    permission: "diklat.training.read",
    children: [
      { label: "Dashboard", href: "/diklat", permission: "diklat.training.read" },
      { label: "Pelatihan", href: "/diklat/trainings", permission: "diklat.training.read" },
      { label: "Peserta", href: "/diklat/participants", permission: "diklat.training.read" },
      { label: "Presensi", href: "/diklat/attendance", permission: "diklat.training.read" },
      { label: "Penilaian", href: "/diklat/assessment", permission: "diklat.training.read" },
      { label: "Sertifikat", href: "/diklat/certificates", permission: "diklat.certificate.read" },
      { label: "Laporan", href: "/diklat/laporan", permission: "diklat.training.read" },
    ],
  },
  {
    label: "Administrasi",
    icon: "administrasi",
    permission: "admin.users.read",
    children: [
      { label: "Pengguna", href: "/admin/users", permission: "admin.users.read" },
      { label: "Audit Log", href: "/admin/audit", permission: "admin.audit.read" },
    ],
  },
  {
    label: "Pengaturan",
    href: "/settings",
    icon: "pengaturan",
    // `/settings` only requires authentication (any logged-in user).
    roles: [
      ...SUPER_ROLES,
      R.ADMIN_KOMITE,
      R.ADMIN_BORANG,
      R.ADMIN_DIKLAT,
      R.VERIFIER,
      R.KOMITE,
      R.DIKLAT_BORANG,
      R.USER,
      R.KEPALA_RUANG,
      "STAFF",
      "VIEWER",
    ],
  },
];

/** True when the item is visible for the given roles + permissions. */
export function visibleFor(item: NavItem, roles: string[], permissions: string[]): boolean {
  if (item.permission) return permissions.includes(item.permission);
  if (item.roles && item.roles.length > 0) return item.roles.some((r) => roles.includes(r));
  return true;
}

/** Filters a nav tree for the given roles/permissions (recursively for children). */
export function filterNav(items: NavItem[], roles: string[], permissions: string[]): NavItem[] {
  return items
    .filter((item) => visibleFor(item, roles, permissions))
    .map((item) =>
      item.children ? { ...item, children: filterNav(item.children, roles, permissions) } : item,
    )
    .filter((item) => !item.children || item.children.length > 0);
}
