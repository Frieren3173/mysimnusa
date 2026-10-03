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
export const ROLES = {
  SUPER_ADMIN:  "SUPER_ADMIN",
  ADMIN_KOMITE: "ADMIN_KOMITE",
  ADMIN_BORANG: "ADMIN_BORANG",
  ADMIN_DIKLAT: "ADMIN_DIKLAT",
  VERIFIER:     "VERIFIER",
  STAFF:        "STAFF",
  VIEWER:       "VIEWER",
} as const;

export type RoleName = typeof ROLES[keyof typeof ROLES];

// Default permission matrix per role
export const ROLE_PERMISSIONS: Record<RoleName, PermissionCode[]> = {
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
  TRAINING_REMINDER:   "TRAINING_REMINDER",
  CERTIFICATE_ISSUED:  "CERTIFICATE_ISSUED",
} as const;

// Document expiry thresholds (days)
export const EXPIRY_WARNING_DAYS = 90;
