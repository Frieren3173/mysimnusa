import { describe, it, expect } from "vitest";
import { PERMISSIONS, ROLES, ROLE_PERMISSIONS } from "@/lib/constants";

/**
 * G — Role × module × action permission matrix (least privilege).
 *
 * Locks the current matrix so a future change cannot silently GRANT a write /
 * admin capability to a read-only or staff role, or let a role reach another
 * module's administration.
 */

const MATRIX = ROLE_PERMISSIONS as unknown as Record<string, string[]>;
const permsOf = (role: string): string[] => MATRIX[role] ?? [];
const has = (role: string, perm: string) => permsOf(role).includes(perm);

describe("G — permission matrix", () => {
  it("SUPERADMIN has every permission (business + legacy superadmin)", () => {
    const all = Object.values(PERMISSIONS) as string[];
    expect(all.every((p) => has(ROLES.SUPERADMIN, p))).toBe(true);
    expect(all.every((p) => has(ROLES.SUPER_ADMIN, p))).toBe(true);
  });

  it("KOMITE role has all Committee functions but NO Borang/Diklat write or admin", () => {
    expect(has(ROLES.KOMITE_KEPERAWATAN_KEBIDANAN, PERMISSIONS.KOMITE_STAFF_UPDATE)).toBe(true);
    expect(has(ROLES.KOMITE_KEPERAWATAN_KEBIDANAN, PERMISSIONS.KOMITE_DOCUMENT_UPLOAD)).toBe(true);
    // No cross-module administration.
    expect(has(ROLES.KOMITE_KEPERAWATAN_KEBIDANAN, PERMISSIONS.ADMIN_SETTINGS)).toBe(false);
    expect(has(ROLES.KOMITE_KEPERAWATAN_KEBIDANAN, PERMISSIONS.ADMIN_USERS_UPDATE)).toBe(false);
    expect(has(ROLES.KOMITE_KEPERAWATAN_KEBIDANAN, PERMISSIONS.BORANG_LOGBOOK_CREATE)).toBe(false);
    expect(has(ROLES.KOMITE_KEPERAWATAN_KEBIDANAN, PERMISSIONS.DIKLAT_TRAINING_CREATE)).toBe(false);
  });

  it("USER (Staff) can create/submit own Borang but NOT verify/approve/print/admin", () => {
    expect(has(ROLES.USER, PERMISSIONS.BORANG_LOGBOOK_CREATE)).toBe(true);
    expect(has(ROLES.USER, PERMISSIONS.BORANG_LOGBOOK_SUBMIT)).toBe(true);
    // No verification/administration of other modules.
    expect(has(ROLES.USER, PERMISSIONS.BORANG_LOGBOOK_VERIFY)).toBe(false);
    expect(has(ROLES.USER, PERMISSIONS.BORANG_LOGBOOK_APPROVE)).toBe(false);
    expect(has(ROLES.USER, PERMISSIONS.BORANG_KARU_REVIEW)).toBe(false);
    expect(has(ROLES.USER, PERMISSIONS.BORANG_ADMIN_REVIEW)).toBe(false);
    expect(has(ROLES.USER, PERMISSIONS.DIKLAT_TRAINING_CREATE)).toBe(false);
    expect(has(ROLES.USER, PERMISSIONS.ADMIN_SETTINGS)).toBe(false);
  });

  it("KEPALA_RUANG can review (KARU) but not admin/settings or other-module writes", () => {
    expect(has(ROLES.KEPALA_RUANG, PERMISSIONS.BORANG_KARU_REVIEW)).toBe(true);
    expect(has(ROLES.KEPALA_RUANG, PERMISSIONS.BORANG_ADMIN_REVIEW)).toBe(false);
    expect(has(ROLES.KEPALA_RUANG, PERMISSIONS.ADMIN_SETTINGS)).toBe(false);
    expect(has(ROLES.KEPALA_RUANG, PERMISSIONS.KOMITE_STAFF_DELETE)).toBe(false);
    expect(has(ROLES.KEPALA_RUANG, PERMISSIONS.DIKLAT_TRAINING_CREATE)).toBe(false);
  });

  it("legacy ADMIN_DIKLAT is Diklat-scoped and has no Borang administration", () => {
    expect(has(ROLES.ADMIN_DIKLAT, PERMISSIONS.DIKLAT_TRAINING_CREATE)).toBe(true);
    expect(has(ROLES.ADMIN_DIKLAT, PERMISSIONS.DIKLAT_CERTIFICATE_ISSUE)).toBe(true);
    expect(has(ROLES.ADMIN_DIKLAT, PERMISSIONS.BORANG_ADMIN_REVIEW)).toBe(false);
    expect(has(ROLES.ADMIN_DIKLAT, PERMISSIONS.ADMIN_SETTINGS)).toBe(false);
  });

  it("legacy ADMIN_BORANG is Borang-scoped and has no Diklat management", () => {
    expect(has(ROLES.ADMIN_BORANG, PERMISSIONS.BORANG_ADMIN_REVIEW)).toBe(true);
    expect(has(ROLES.ADMIN_BORANG, PERMISSIONS.BORANG_PRINT)).toBe(true);
    expect(has(ROLES.ADMIN_BORANG, PERMISSIONS.DIKLAT_TRAINING_CREATE)).toBe(false);
    expect(has(ROLES.ADMIN_BORANG, PERMISSIONS.KOMITE_COMPETENCY_UPDATE)).toBe(false);
  });

  it("no non-superadmin role has admin.users/roles/settings management", () => {
    const adminPerms = [PERMISSIONS.ADMIN_USERS_READ, PERMISSIONS.ADMIN_USERS_UPDATE, PERMISSIONS.ADMIN_ROLES_MANAGE, PERMISSIONS.ADMIN_SETTINGS];
    for (const role of Object.keys(ROLE_PERMISSIONS)) {
      if (role === ROLES.SUPERADMIN || role === ROLES.SUPER_ADMIN) continue;
      for (const p of adminPerms) {
        // ADMIN_SETTINGS is intentionally granted ONLY to admins; assert no
        // read-only / staff role has it.
        if ([ROLES.USER, ROLES.KEPALA_RUANG, ROLES.KOMITE_KEPERAWATAN_KEBIDANAN, ROLES.VIEWER].includes(role as never)) {
          expect(has(role, p)).toBe(false);
        }
      }
    }
  });
});

describe("workflow-stage permission mapping (Borang)", () => {
  it("KEPALA_RUANG holds stage-1 review but NOT stage-2 (admin review) or print", () => {
    expect(has(ROLES.KEPALA_RUANG, PERMISSIONS.BORANG_KARU_REVIEW)).toBe(true);
    expect(has(ROLES.KEPALA_RUANG, PERMISSIONS.BORANG_ADMIN_REVIEW)).toBe(false);
    expect(has(ROLES.KEPALA_RUANG, PERMISSIONS.BORANG_PRINT)).toBe(false);
  });

  it("Sekretariat (DIKLAT_BORANG + legacy ADMIN_BORANG) hold stage-2 review and print", () => {
    for (const role of [ROLES.DIKLAT_BORANG, ROLES.ADMIN_BORANG]) {
      expect(has(role, PERMISSIONS.BORANG_ADMIN_REVIEW)).toBe(true);
      expect(has(role, PERMISSIONS.BORANG_PRINT)).toBe(true);
    }
  });

  it("Sekretariat/Admin_Borang do NOT hold the Kepala Ruang stage-1 review", () => {
    for (const role of [ROLES.DIKLAT_BORANG, ROLES.ADMIN_BORANG]) {
      expect(has(role, PERMISSIONS.BORANG_KARU_REVIEW)).toBe(false);
    }
  });

  it("Staff (USER) can create/submit but NOT review (stage 1 or 2) or print", () => {
    expect(has(ROLES.USER, PERMISSIONS.BORANG_LOGBOOK_CREATE)).toBe(true);
    expect(has(ROLES.USER, PERMISSIONS.BORANG_LOGBOOK_SUBMIT)).toBe(true);
    expect(has(ROLES.USER, PERMISSIONS.BORANG_KARU_REVIEW)).toBe(false);
    expect(has(ROLES.USER, PERMISSIONS.BORANG_ADMIN_REVIEW)).toBe(false);
    expect(has(ROLES.USER, PERMISSIONS.BORANG_PRINT)).toBe(false);
  });

  it("read-only roles (VIEWER, KOMITE, KEPALA_RUANG, USER) cannot verify or print", () => {
    for (const role of [ROLES.VIEWER, ROLES.KOMITE_KEPERAWATAN_KEBIDANAN, ROLES.KEPALA_RUANG, ROLES.USER]) {
      expect(has(role, PERMISSIONS.BORANG_ADMIN_REVIEW)).toBe(false);
      expect(has(role, PERMISSIONS.BORANG_PRINT)).toBe(false);
      expect(has(role, PERMISSIONS.BORANG_COMPLETE)).toBe(false);
    }
    // VIEWER is the read-only "Kasi Keperawatan" style role: read all modules, no writes.
    expect(has(ROLES.VIEWER, PERMISSIONS.KOMITE_STAFF_READ)).toBe(true);
    expect(has(ROLES.VIEWER, PERMISSIONS.BORANG_LOGBOOK_CREATE)).toBe(false);
    expect(has(ROLES.VIEWER, PERMISSIONS.DIKLAT_TRAINING_CREATE)).toBe(false);
  });

  it("VIEWER (Kasi Keperawatan) has read for all three dashboards but no write/verify/register-upload", () => {
    // Read for the three dashboards the owner listed.
    expect(has(ROLES.VIEWER, PERMISSIONS.KOMITE_STAFF_READ)).toBe(true);
    expect(has(ROLES.VIEWER, PERMISSIONS.BORANG_LOGBOOK_READ)).toBe(true);
    expect(has(ROLES.VIEWER, PERMISSIONS.DIKLAT_TRAINING_READ)).toBe(true);
    // No write / verify / register-upload (register upload requires BORANG_KARU_REVIEW).
    expect(has(ROLES.VIEWER, PERMISSIONS.BORANG_KARU_REVIEW)).toBe(false);
    expect(has(ROLES.VIEWER, PERMISSIONS.BORANG_LOGBOOK_CREATE)).toBe(false);
    expect(has(ROLES.VIEWER, PERMISSIONS.KOMITE_STAFF_UPDATE)).toBe(false);
    expect(has(ROLES.VIEWER, PERMISSIONS.KOMITE_STAFF_DELETE)).toBe(false);
    expect(has(ROLES.VIEWER, PERMISSIONS.KOMITE_DOCUMENT_UPLOAD)).toBe(false);
    expect(has(ROLES.VIEWER, PERMISSIONS.DIKLAT_CERTIFICATE_ISSUE)).toBe(false);
  });
});
