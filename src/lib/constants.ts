// Permission codes for RBAC
// Format: module.resource.action

export const PERMISSIONS = {
  // Komite
  KOMITE_STAFF_READ:   "komite.staff.read",
  KOMITE_STAFF_CREATE: "komite.staff.create",
  KOMITE_STAFF_UPDATE: "komite.staff.update",
  KOMITE_STAFF_DELETE: "komite.staff.delete",

  KOMITE_LICENSE_READ:   "komite.license.read",
  KOMITE_LICENSE_CREATE: "komite.license.create",
  KOMITE_LICENSE_UPDATE: "komite.license.update",

  KOMITE_COMPETENCY_READ:   "komite.competency.read",
  KOMITE_COMPETENCY_UPDATE: "komite.competency.update",

  KOMITE_DOCUMENT_READ:   "komite.document.read",
  KOMITE_DOCUMENT_UPLOAD: "komite.document.upload",
  KOMITE_DOCUMENT_DELETE: "komite.document.delete",

  // Borang
  BORANG_LOGBOOK_READ:   "borang.logbook.read",
  BORANG_LOGBOOK_CREATE: "borang.logbook.create",
  BORANG_LOGBOOK_UPDATE: "borang.logbook.update",
  BORANG_LOGBOOK_SUBMIT: "borang.logbook.submit",
  BORANG_LOGBOOK_VERIFY: "borang.logbook.verify",
  BORANG_LOGBOOK_APPROVE:"borang.logbook.approve",
  BORANG_LOGBOOK_REJECT: "borang.logbook.reject",
  BORANG_LOGBOOK_ARCHIVE:"borang.logbook.archive",

  // Borang — Kepala Ruang review (additive)
  BORANG_KARU_REVIEW:    "borang.karu.review",
  // Borang — DIKLAT_BORANG / sekretariat administrative processing (additive)
  BORANG_ADMIN_REVIEW:   "borang.admin.review",
  BORANG_PRINT:          "borang.press.print",
  BORANG_COMPLETE:       "borang.press.complete",

  // Diklat
  DIKLAT_TRAINING_READ:   "diklat.training.read",
  DIKLAT_TRAINING_CREATE: "diklat.training.create",
  DIKLAT_TRAINING_UPDATE: "diklat.training.update",
  DIKLAT_TRAINING_DELETE: "diklat.training.delete",
  DIKLAT_TRAINING_MANAGE_PARTICIPANTS: "diklat.training.manage_participants",
  DIKLAT_TRAINING_MANAGE_ATTENDANCE:   "diklat.training.manage_attendance",
  DIKLAT_CERTIFICATE_ISSUE: "diklat.certificate.issue",
  DIKLAT_CERTIFICATE_READ:  "diklat.certificate.read",

  // Admin
  ADMIN_USERS_READ:   "admin.users.read",
  ADMIN_USERS_CREATE: "admin.users.create",
  ADMIN_USERS_UPDATE: "admin.users.update",
  ADMIN_USERS_DELETE: "admin.users.delete",
  ADMIN_ROLES_MANAGE: "admin.roles.manage",
  ADMIN_AUDIT_READ:   "admin.audit.read",
  ADMIN_SETTINGS:     "admin.settings.manage",
  ADMIN_MIGRATION:    "admin.migration.manage",
} as const;

export type PermissionCode = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Role definitions
//
// Legacy roles (SUPER_ADMIN, ADMIN_KOMITE, ADMIN_BORANG, ADMIN_DIKLAT, VERIFIER,
// STAFF, VIEWER) are retained unchanged for backward compatibility. The
// business roles below are added additively for the Borang workflow v1; the
// Superadmin assigns them to accounts explicitly.
export const ROLES = {
  // Legacy roles — kept as-is.
  SUPER_ADMIN:  "SUPER_ADMIN",
  ADMIN_KOMITE: "ADMIN_KOMITE",
  ADMIN_BORANG: "ADMIN_BORANG",
  ADMIN_DIKLAT: "ADMIN_DIKLAT",
  VERIFIER:     "VERIFIER",
  STAFF:        "STAFF",
  VIEWER:       "VIEWER",

  // Business roles (target for the new workflow). `SUPERADMIN` and
  // `KOMITE_KEPERAWATAN_KEBIDANAN` are the intended replacements for
  // SUPER_ADMIN / ADMIN_KOMITE; the others are brand-new scopes.
  SUPERADMIN:                    "SUPERADMIN",
  KOMITE_KEPERAWATAN_KEBIDANAN:  "KOMITE_KEPERAWATAN_KEBIDANAN",
  DIKLAT_BORANG:                 "DIKLAT_BORANG",
  USER:                          "USER",
  KEPALA_RUANG:                  "KEPALA_RUANG",
} as const;

export type RoleName = typeof ROLES[keyof typeof ROLES];

/**
 * Business-role → permissions.
 *
 * Only the five target business roles are listed here. Legacy roles keep their
 * existing permission sets (see LEGACY_ROLE_PERMISSIONS) and both are merged
 * into ROLE_PERMISSIONS so the seed creates every role without changing what
 * existing accounts can do.
 */
export const BUSINESS_ROLE_PERMISSIONS: Record<
  (typeof ROLES)["SUPERADMIN"] | (typeof ROLES)["KOMITE_KEPERAWATAN_KEBIDANAN"] | (typeof ROLES)["DIKLAT_BORANG"] | (typeof ROLES)["USER"] | (typeof ROLES)["KEPALA_RUANG"],
  PermissionCode[]
> = {
  // Full access to every feature.
  SUPERADMIN: Object.values(PERMISSIONS) as PermissionCode[],

  // Committee only — no Diklat/Borang, no admin settings.
  KOMITE_KEPERAWATAN_KEBIDANAN: [
    PERMISSIONS.KOMITE_STAFF_READ,
    PERMISSIONS.KOMITE_STAFF_CREATE,
    PERMISSIONS.KOMITE_STAFF_UPDATE,
    PERMISSIONS.KOMITE_STAFF_DELETE,
    PERMISSIONS.KOMITE_LICENSE_READ,
    PERMISSIONS.KOMITE_LICENSE_CREATE,
    PERMISSIONS.KOMITE_LICENSE_UPDATE,
    PERMISSIONS.KOMITE_COMPETENCY_READ,
    PERMISSIONS.KOMITE_COMPETENCY_UPDATE,
    PERMISSIONS.KOMITE_DOCUMENT_READ,
    PERMISSIONS.KOMITE_DOCUMENT_UPLOAD,
    PERMISSIONS.KOMITE_DOCUMENT_DELETE,
  ],

  // Secretariat: Diklat + Borang administrative processing.
  DIKLAT_BORANG: [
    PERMISSIONS.KOMITE_STAFF_READ,
    // Borang — administrative review, print, complete (no KARU sign-off).
    PERMISSIONS.BORANG_LOGBOOK_READ,
    PERMISSIONS.BORANG_LOGBOOK_ARCHIVE,
    PERMISSIONS.BORANG_ADMIN_REVIEW,
    PERMISSIONS.BORANG_PRINT,
    PERMISSIONS.BORANG_COMPLETE,
    // Diklat — full management.
    PERMISSIONS.DIKLAT_TRAINING_READ,
    PERMISSIONS.DIKLAT_TRAINING_CREATE,
    PERMISSIONS.DIKLAT_TRAINING_UPDATE,
    PERMISSIONS.DIKLAT_TRAINING_DELETE,
    PERMISSIONS.DIKLAT_TRAINING_MANAGE_PARTICIPANTS,
    PERMISSIONS.DIKLAT_TRAINING_MANAGE_ATTENDANCE,
    PERMISSIONS.DIKLAT_CERTIFICATE_ISSUE,
    PERMISSIONS.DIKLAT_CERTIFICATE_READ,
  ],

  // Regular user: own-room Borang only.
  USER: [
    PERMISSIONS.KOMITE_STAFF_READ,
    PERMISSIONS.BORANG_LOGBOOK_READ,
    PERMISSIONS.BORANG_LOGBOOK_CREATE,
    PERMISSIONS.BORANG_LOGBOOK_UPDATE,
    PERMISSIONS.BORANG_LOGBOOK_SUBMIT,
  ],

  // Kepala Ruang: review Borang for assigned rooms only.
  KEPALA_RUANG: [
    PERMISSIONS.KOMITE_STAFF_READ,
    PERMISSIONS.BORANG_LOGBOOK_READ,
    PERMISSIONS.BORANG_KARU_REVIEW,
  ],
};

/** Legacy role → permissions (unchanged behaviour). */
export const LEGACY_ROLE_PERMISSIONS: Record<
  | (typeof ROLES)["SUPER_ADMIN"]
  | (typeof ROLES)["ADMIN_KOMITE"]
  | (typeof ROLES)["ADMIN_BORANG"]
  | (typeof ROLES)["ADMIN_DIKLAT"]
  | (typeof ROLES)["VERIFIER"]
  | (typeof ROLES)["STAFF"]
  | (typeof ROLES)["VIEWER"],
  PermissionCode[]
> = {
  SUPER_ADMIN: Object.values(PERMISSIONS) as PermissionCode[],

  ADMIN_KOMITE: [
    PERMISSIONS.KOMITE_STAFF_READ,
    PERMISSIONS.KOMITE_STAFF_CREATE,
    PERMISSIONS.KOMITE_STAFF_UPDATE,
    PERMISSIONS.KOMITE_LICENSE_READ,
    PERMISSIONS.KOMITE_LICENSE_CREATE,
    PERMISSIONS.KOMITE_LICENSE_UPDATE,
    PERMISSIONS.KOMITE_COMPETENCY_READ,
    PERMISSIONS.KOMITE_COMPETENCY_UPDATE,
    PERMISSIONS.KOMITE_DOCUMENT_READ,
    PERMISSIONS.KOMITE_DOCUMENT_UPLOAD,
    PERMISSIONS.DIKLAT_TRAINING_READ,
    PERMISSIONS.DIKLAT_CERTIFICATE_READ,
    PERMISSIONS.BORANG_LOGBOOK_READ,
  ],

  ADMIN_BORANG: [
    PERMISSIONS.KOMITE_STAFF_READ,
    PERMISSIONS.BORANG_LOGBOOK_READ,
    PERMISSIONS.BORANG_LOGBOOK_CREATE,
    PERMISSIONS.BORANG_LOGBOOK_UPDATE,
    PERMISSIONS.BORANG_LOGBOOK_SUBMIT,
    PERMISSIONS.BORANG_LOGBOOK_VERIFY,
    PERMISSIONS.BORANG_LOGBOOK_APPROVE,
    PERMISSIONS.BORANG_LOGBOOK_REJECT,
    PERMISSIONS.BORANG_LOGBOOK_ARCHIVE,
    // Additive: legacy Borang admin also acts as the sekretariat.
    PERMISSIONS.BORANG_ADMIN_REVIEW,
    PERMISSIONS.BORANG_PRINT,
    PERMISSIONS.BORANG_COMPLETE,
  ],

  ADMIN_DIKLAT: [
    PERMISSIONS.KOMITE_STAFF_READ,
    PERMISSIONS.DIKLAT_TRAINING_READ,
    PERMISSIONS.DIKLAT_TRAINING_CREATE,
    PERMISSIONS.DIKLAT_TRAINING_UPDATE,
    PERMISSIONS.DIKLAT_TRAINING_MANAGE_PARTICIPANTS,
    PERMISSIONS.DIKLAT_TRAINING_MANAGE_ATTENDANCE,
    PERMISSIONS.DIKLAT_CERTIFICATE_ISSUE,
    PERMISSIONS.DIKLAT_CERTIFICATE_READ,
  ],

  VERIFIER: [
    PERMISSIONS.KOMITE_STAFF_READ,
    PERMISSIONS.BORANG_LOGBOOK_READ,
    PERMISSIONS.BORANG_LOGBOOK_VERIFY,
    PERMISSIONS.BORANG_LOGBOOK_APPROVE,
    PERMISSIONS.BORANG_LOGBOOK_REJECT,
  ],

  STAFF: [
    PERMISSIONS.KOMITE_STAFF_READ,
    PERMISSIONS.BORANG_LOGBOOK_READ,
    PERMISSIONS.BORANG_LOGBOOK_CREATE,
    PERMISSIONS.BORANG_LOGBOOK_SUBMIT,
    PERMISSIONS.DIKLAT_TRAINING_READ,
    PERMISSIONS.DIKLAT_CERTIFICATE_READ,
  ],

  VIEWER: [
    PERMISSIONS.KOMITE_STAFF_READ,
    PERMISSIONS.KOMITE_LICENSE_READ,
    PERMISSIONS.BORANG_LOGBOOK_READ,
    PERMISSIONS.DIKLAT_TRAINING_READ,
  ],
};

/** Complete role → permission matrix (legacy + business), used by the seed. */
export const ROLE_PERMISSIONS: Record<RoleName, PermissionCode[]> = {
  ...LEGACY_ROLE_PERMISSIONS,
  ...BUSINESS_ROLE_PERMISSIONS,
};

// Document types
export const DOCUMENT_TYPES = {
  STR:   { code: "STR",   name: "Surat Tanda Registrasi", hasExpiry: true },
  SIP:   { code: "SIP",   name: "Surat Izin Praktik", hasExpiry: true },
  BTCLS: { code: "BTCLS", name: "BTCLS", hasExpiry: true },
  ACLS:  { code: "ACLS",  name: "ACLS", hasExpiry: true },
  CV:    { code: "CV",    name: "Curriculum Vitae", hasExpiry: false },
  RKK:   { code: "RKK",  name: "Rincian Kewenangan Klinis", hasExpiry: false },
  RKK_PREV: { code: "RKK_PREV", name: "RKK Sebelumnya", hasExpiry: false },
  IJAZAH: { code: "IJAZAH", name: "Ijazah", hasExpiry: false },
  IJAZAH_VERIFY: { code: "IJAZAH_VERIFY", name: "Verifikasi Ijazah", hasExpiry: false },
  SURAT_PENGALAMAN: { code: "SURAT_PENGALAMAN", name: "Surat Pengalaman Kerja", hasExpiry: false },
  FOTO:  { code: "FOTO",  name: "Foto Profil", hasExpiry: false },
} as const;

// Competency types
export const COMPETENCIES = [
  { code: "BEDAH",      name: "Bedah" },
  { code: "ICU",        name: "ICU" },
  { code: "PICU",       name: "PICU" },
  { code: "NICU",       name: "NICU" },
  { code: "HEMODIALISA",name: "Hemodialisa" },
  { code: "CATHLAB",    name: "Cathlab" },
  { code: "PPGDON",     name: "PPGDON" },
  { code: "APN",        name: "APN" },
] as const;

// Notification types
export const NOTIFICATION_TYPES = {
  STR_EXPIRING:        "STR_EXPIRING",
  SIP_EXPIRING:        "SIP_EXPIRING",
  DOCUMENT_MISSING:    "DOCUMENT_MISSING",
  BORANG_SUBMITTED:    "BORANG_SUBMITTED",
  BORANG_REJECTED:     "BORANG_REJECTED",
  BORANG_APPROVED:     "BORANG_APPROVED",
  // Borang workflow v1 (additive)
  BORANG_KARU_QUEUED:     "BORANG_KARU_QUEUED",
  BORANG_KARU_APPROVED:   "BORANG_KARU_APPROVED",
  BORANG_REVISION_NEEDED: "BORANG_REVISION_NEEDED",
  BORANG_SECRETARIAT_QUEUED: "BORANG_SECRETARIAT_QUEUED",
  BORANG_READY_TO_PRINT:  "BORANG_READY_TO_PRINT",
  TRAINING_REMINDER:   "TRAINING_REMINDER",
  CERTIFICATE_ISSUED:  "CERTIFICATE_ISSUED",
} as const;

// Document expiry thresholds (days)
export const EXPIRY_WARNING_DAYS = 90;
