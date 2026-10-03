import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Audit Log" };

const ACTION_VARIANT: Record<string, "active" | "info" | "expired" | "pending" | "default"> = {
  CREATED: "info",
  UPDATED: "pending",
  DELETED: "expired",
  SUBMITTED: "pending",
  APPROVED: "active",
  REJECTED: "expired",
  IMPORTED: "info",
};

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string; action?: string; page?: string }>;
}) {
  const currentUser = await requirePermission(PERMISSIONS.ADMIN_AUDIT_READ);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const perPage = 50;

  const where = {
    ...(sp.module ? { module: sp.module } : {}),
    ...(sp.action ? { action: sp.action } : {}),
  };

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const qs = (p: number) => {
    const q = new URLSearchParams();
    if (sp.module) q.set("module", sp.module);
    if (sp.action) q.set("action", sp.action);
    q.set("page", String(p));
    return `?${q.toString()}`;
  };

  const breadcrumbs = [{ label: "Audit Log" }];

  return (
    <AppShell
      breadcrumbs={breadcrumbs}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Staff",
      }}
    >
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Audit Log</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Jejak perubahan data sistem ({total} entri).
          </p>
        </div>

        {/* Filters */}
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Modul</label>
            <select
              name="module"
              defaultValue={sp.module ?? ""}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">Semua</option>
              {["admin", "komite", "borang", "diklat", "migration"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Aksi</label>
            <select
              name="action"
              defaultValue={sp.action ?? ""}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">Semua</option>
              {["CREATED", "UPDATED", "DELETED", "SUBMITTED", "APPROVED", "REJECTED"].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="h-9 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
          >
            Terapkan
          </button>
        </form>

        <Card>
          <CardHeader>
            <CardTitle>Entri Log</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <Th>Waktu</Th>
                  <Th>Pengguna</Th>
                  <Th>Modul</Th>
                  <Th>Resource</Th>
                  <Th>Aksi</Th>
                  <Th>ID Target</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <Td colSpan={6} className="text-center text-xs text-slate-400 py-8">
                      Belum ada entri audit.
                    </Td>
                  </TableRow>
                ) : (
                  logs.map((l) => (
                    <TableRow key={l.id}>
                      <Td className="text-xs text-slate-500 whitespace-nowrap">
                        {new Date(l.createdAt).toLocaleString("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </Td>
                      <Td className="text-xs font-medium text-slate-800">
                        {l.user?.username ?? "—"}
                      </Td>
                      <Td>
                        <Badge variant="default" showDot={false}>
                          {l.module}
                        </Badge>
                      </Td>
                      <Td className="text-xs text-slate-600">{l.resource}</Td>
                      <Td>
                        <Badge variant={ACTION_VARIANT[l.action] ?? "default"} showDot={false}>
                          {l.action}
                        </Badge>
                      </Td>
                      <Td className="font-mono text-[10px] text-slate-400 max-w-[160px] truncate">
                        {l.resourceId ?? "—"}
                      </Td>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Halaman {page} dari {totalPages}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <a href={qs(page - 1)} className="text-blue-600 hover:underline">
                  ← Sebelumnya
                </a>
              )}
              {page < totalPages && (
                <a href={qs(page + 1)} className="text-blue-600 hover:underline">
                  Berikutnya →
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
