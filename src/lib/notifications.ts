import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { logServerError } from "@/lib/logger";

/**
 * In-app notification helpers for the Borang workflow.
 *
 * Notifications are best-effort: a failure to write one must never break the
 * workflow transition. All writes go through `notify`, which swallows errors
 * (after logging) so callers can fire-and-forget.
 */

export interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
}

/** Creates a single notification. Never throws. */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link ?? null,
      },
    });
  } catch (e) {
    logServerError("notifications.notify", e);
  }
}

/**
 * Notifies every active user holding any of the given roles.
 *
 * Used to fan out queue notifications (e.g. all DIKLAT_BORANG users when a
 * Borang reaches the secretariat queue). De-duplicates recipients.
 */
export async function notifyRoleHolders(
  roleNames: readonly string[],
  input: Omit<NotifyInput, "userId">,
): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        userRoles: { some: { role: { name: { in: [...roleNames] } } } },
      },
      select: { id: true },
    });
    const unique = Array.from(new Set(users.map((u) => u.id)));
    await Promise.all(unique.map((userId) => notify({ ...input, userId })));
  } catch (e) {
    logServerError("notifications.notifyRoleHolders", e);
  }
}

/** Convenience: notify the secretariat (DIKLAT_BORANG) about a queue event. */
export function notifySecretariat(input: Omit<NotifyInput, "userId">): Promise<void> {
  return notifyRoleHolders([ROLES.DIKLAT_BORANG], input);
}
