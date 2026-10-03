import { prisma } from "@/lib/prisma";

export interface AuditInput {
  userId?: string | null;
  staffId?: string | null;
  borangId?: string | null;
  module: string; // komite, borang, diklat, admin, migration
  resource: string;
  resourceId?: string | null;
  action: string; // CREATED, UPDATED, DELETED, SUBMITTED, APPROVED, REJECTED, IMPORTED...
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Best-effort audit logging — never throws into the request path. */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        staffId: input.staffId ?? null,
        borangId: input.borangId ?? null,
        module: input.module,
        resource: input.resource,
        resourceId: input.resourceId ?? null,
        action: input.action,
        before: (input.before ?? undefined) as never,
        after: (input.after ?? undefined) as never,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch {
    // Audit must never break the main operation
  }
}

/** Extract client IP from request headers (dev/proxy aware). */
export function clientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}
