import { ok, err } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { logServerError, safeErrorMessage } from "@/lib/logger";

/**
 * GET /api/diklat/agenda
 *
 * Upcoming + ongoing IHT activities for the dashboard widget. "Ongoing" = now
 * within [startDate, endDate]; "upcoming" = startDate in the future. CANCELLED
 * and COMPLETED activities are excluded from the active agenda. The client
 * distinguishes the two using the same date boundaries returned here.
 *
 * Requires `diklat.training.read`.
 */
export async function GET() {
  const { authorized, user } = await checkPermission(PERMISSIONS.DIKLAT_TRAINING_READ);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  try {
    const now = new Date();
    const trainings = await prisma.training.findMany({
      where: {
        status: { notIn: ["CANCELLED", "COMPLETED"] },
        endDate: { gte: now },
      },
      orderBy: { startDate: "asc" },
      take: 20,
      select: {
        id: true,
        title: true,
        category: true,
        startDate: true,
        endDate: true,
        location: true,
        status: true,
        _count: { select: { participants: true } },
      },
    });

    const data = trainings.map((t) => {
      const ongoing = t.startDate <= now && t.endDate >= now;
      return {
        id: t.id,
        title: t.title,
        category: t.category,
        startDate: t.startDate.toISOString(),
        endDate: t.endDate.toISOString(),
        location: t.location,
        status: t.status,
        participants: t._count.participants,
        ongoing,
      };
    });

    return ok({ now: now.toISOString(), items: data });
  } catch (e) {
    logServerError("diklat.agenda", e);
    return err("LOAD_FAILED", safeErrorMessage("LOAD_FAILED"), 500);
  }
}
