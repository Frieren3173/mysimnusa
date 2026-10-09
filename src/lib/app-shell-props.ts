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
