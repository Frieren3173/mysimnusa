import { describe, it, expect } from "vitest";
import { NAV_ITEMS, filterNav, type NavItem } from "@/lib/nav";
import { PERMISSIONS } from "@/lib/constants";

/**
 * Menu-visibility regression.
 *
 * Locks the rule that a menu item is only shown when the account actually holds
 * the permission the target page requires — so a role can never see a link that
 * leads to a 403 (and the sidebar mirrors the five business roles).
 */

/** Helper: a role's permission codes, mirroring constants.ts role matrix. */
function permsOf(codes: string[]): string[] {
  return codes;
}

/** Collects all visible hrefs + group labels from a filtered nav tree. */
function visibleHrefs(items: NavItem[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (item.href) out.push(item.href);
    if (item.children) out.push(...visibleHrefs(item.children));
  }
  return out;
}

function groupLabels(items: NavItem[]): string[] {
  return items.map((i) => i.label);
}

const KOMITE_PERMS = permsOf([
  PERMISSIONS.KOMITE_STAFF_READ,
  PERMISSIONS.KOMITE_LICENSE_READ,
  PERMISSIONS.KOMITE_COMPETENCY_READ,
  PERMISSIONS.KOMITE_DOCUMENT_READ,
]);

const USER_PERMS = permsOf([
  PERMISSIONS.BORANG_LOGBOOK_READ,
  PERMISSIONS.BORANG_LOGBOOK_CREATE,
  PERMISSIONS.BORANG_LOGBOOK_UPDATE,
  PERMISSIONS.BORANG_LOGBOOK_SUBMIT,
]);

const KEPALA_RUANG_PERMS = permsOf([
  PERMISSIONS.BORANG_LOGBOOK_READ,
  PERMISSIONS.BORANG_KARU_REVIEW,
]);

const DIKLAT_BORANG_PERMS = permsOf([
  PERMISSIONS.BORANG_LOGBOOK_READ,
  PERMISSIONS.BORANG_ADMIN_REVIEW,
  PERMISSIONS.BORANG_PRINT,
  PERMISSIONS.BORANG_COMPLETE,
  PERMISSIONS.DIKLAT_TRAINING_READ,
  PERMISSIONS.DIKLAT_CERTIFICATE_READ,
]);

const SUPERADMIN_PERMS = Object.values(PERMISSIONS);

describe("sidebar visibility per business role", () => {
  it("KOMITE_KEPERAWATAN_KEBIDANAN sees Komite only (no Borang/Diklat/Admin)", () => {
    const nav = filterNav(NAV_ITEMS, ["KOMITE_KEPERAWATAN_KEBIDANAN"], KOMITE_PERMS);
    const labels = groupLabels(nav);
    expect(labels).toContain("Komite Keperawatan dan Kebidanan");
    expect(labels).not.toContain("Borang");
    expect(labels).not.toContain("Diklat");
    expect(labels).not.toContain("Administrasi");
    const hrefs = visibleHrefs(nav);
    expect(hrefs).toContain("/komite/staff");
    expect(hrefs.some((h) => h.startsWith("/borang"))).toBe(false);
  });

  it("USER sees Borang (record + submit) but NOT Input review/secretariat/print", () => {
    const nav = filterNav(NAV_ITEMS, ["USER"], USER_PERMS);
    const hrefs = visibleHrefs(nav);
    expect(hrefs).toContain("/borang/logbook");
    expect(hrefs).toContain("/borang/entry");
    expect(hrefs).not.toContain("/borang/review");
    expect(hrefs).not.toContain("/borang/secretariat");
    expect(hrefs).not.toContain("/borang/print");
    expect(groupLabels(nav)).not.toContain("Diklat");
    expect(groupLabels(nav)).not.toContain("Administrasi");
  });

  it("KEPALA_RUANG sees Review only (no Input Borang)", () => {
    const nav = filterNav(NAV_ITEMS, ["KEPALA_RUANG"], KEPALA_RUANG_PERMS);
    const hrefs = visibleHrefs(nav);
    expect(hrefs).toContain("/borang/review");
    expect(hrefs).not.toContain("/borang/entry");
    expect(hrefs).not.toContain("/borang/secretariat");
    expect(hrefs).not.toContain("/borang/print");
    expect(hrefs).not.toContain("/borang/verification");
    expect(groupLabels(nav)).not.toContain("Komite Keperawatan dan Kebidanan");
  });

  it("DIKLAT_BORANG sees Diklat + Sekretariat + Cetak, not Review", () => {
    const nav = filterNav(NAV_ITEMS, ["DIKLAT_BORANG"], DIKLAT_BORANG_PERMS);
    const hrefs = visibleHrefs(nav);
    expect(hrefs).toContain("/borang/secretariat");
    expect(hrefs).toContain("/borang/print");
    expect(hrefs).toContain("/diklat/trainings");
    expect(hrefs).toContain("/diklat/laporan");
    expect(hrefs).not.toContain("/borang/review");
    expect(hrefs).not.toContain("/borang/entry");
    expect(groupLabels(nav)).not.toContain("Administrasi");
  });

  it("SUPERADMIN sees every group", () => {
    const nav = filterNav(NAV_ITEMS, ["SUPERADMIN"], SUPERADMIN_PERMS);
    const labels = groupLabels(nav);
    expect(labels).toEqual([
      "Overview",
      "Komite Keperawatan dan Kebidanan",
      "Borang",
      "Diklat",
      "Administrasi",
      "Pengaturan",
    ]);
    const hrefs = visibleHrefs(nav);
    for (const h of [
      "/borang/review",
      "/borang/secretariat",
      "/borang/print",
      "/borang/verification",
      "/borang/archive",
      "/borang/master/ruangan",
      "/admin/users",
      "/admin/audit",
    ]) {
      expect(hrefs).toContain(h);
    }
  });

  it("a permission-gated item is never shown without its permission", () => {
    // Empty permissions but a role list that would have passed the old rule.
    const nav = filterNav(NAV_ITEMS, ["KOMITE_KEPERAWATAN_KEBIDANAN"], []);
    expect(groupLabels(nav)).not.toContain("Borang");
    expect(groupLabels(nav)).not.toContain("Komite Keperawatan dan Kebidanan");
  });
});
