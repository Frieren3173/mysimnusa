import type { CurrentUser } from "@/lib/auth";

/**
 * Builds the common `AppShell` props (breadcrumb user + role/permission lists)
 * from the authenticated user.
 *
 * The role/permission lists drive **menu visibility only** — never
 * authorisation. Passing them consistently keeps the sidebar identical on every
 * page so an account never sees a menu that differs from its own permissions.
 */
export function appShellUser(user: CurrentUser) {
  return {
    name: user.staff?.name ?? user.username,
    email: user.email,
    role: user.roles[0] ?? "Pengguna",
  };
}

export function appShellVisibility(user: CurrentUser) {
  return {
    roles: user.roles,
    permissions: Array.from(user.permissions),
  };
}

/**
 * Diklat TrainingManager capability flags, derived from the user's permissions.
 *
 * Assessment accepts the dedicated `manage_assessment` permission OR the legacy
 * `manage_attendance` (kept for backward compatibility), mirroring the API gate
 * in the assessments route.
 */
export function diklatManagerPerms(user: CurrentUser) {
  return {
    manageParticipants: user.hasPermission("diklat.training.manage_participants"),
    manageAttendance: user.hasPermission("diklat.training.manage_attendance"),
    manageAssessment:
      user.hasPermission("diklat.training.manage_assessment") ||
      user.hasPermission("diklat.training.manage_attendance"),
    issueCertificate: user.hasPermission("diklat.certificate.issue"),
  };
}
