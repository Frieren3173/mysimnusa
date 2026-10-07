/**
 * Shared Prisma `select` shapes for User records returned by the API.
 *
 * `passwordHash` is deliberately absent everywhere: credential material must
 * never leave the server, and no API response includes it.
 */

/** User fields safe to return from admin user endpoints. */
export const USER_API_SELECT = {
  id: true,
  username: true,
  email: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  staff: { select: { id: true, name: true } },
  userRoles: {
    select: { role: { select: { name: true, description: true } } },
  },
} as const;

/**
 * Fields required by `getCurrentUser` (auth context): identity, roles with
 * their permissions, and the linked staff record. Never `passwordHash`.
 */
export const CURRENT_USER_SELECT = {
  id: true,
  username: true,
  email: true,
  isActive: true,
  userRoles: {
    select: {
      role: {
        select: {
          name: true,
          rolePermissions: { select: { permission: { select: { code: true } } } },
        },
      },
    },
  },
  staff: {
    select: {
      id: true,
      name: true,
      profession: true,
      roomId: true,
    },
  },
} as const;
