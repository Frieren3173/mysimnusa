import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { StaffForm, type FormStaff } from "../../staff-form";
import { DocumentsPanel, type FormDocument } from "../../documents-panel";

export const metadata: Metadata = { title: "Edit Data SDM" };

export default async function EditStaffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const currentUser = await requirePermission(PERMISSIONS.KOMITE_STAFF_UPDATE);
  const { id } = await params;

  const staff = await prisma.staff.findUnique({
    where: { id },
    include: { education: true, competencies: true, documents: { include: { documentType: true } } },
  });
  if (!staff) notFound();

  const [rooms, competencies] = await Promise.all([
    prisma.room.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.competency.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  const formStaff: FormStaff = {
    id: staff.id,
    name: staff.name,
    nip: staff.nip,
    email: staff.email,
    phone: staff.phone,
    address: staff.address,
    dateOfBirth: staff.dateOfBirth?.toISOString() ?? null,
    profession: staff.profession,
    roomId: staff.roomId,
    employmentStatus: staff.employmentStatus,
    isActive: staff.isActive,
    education: staff.education.map((e) => ({
      id: e.id,
      level: e.level,
      institution: e.institution,
      major: e.major,
      graduationYear: e.graduationYear,
    })),
    competencies: [],
  };

  const compRows = await prisma.staffCompetency.findMany({
    where: { staffId: id },
    include: { competency: { select: { code: true } } },
  });
  formStaff.competencies = compRows.map((c) => ({ code: c.competency.code }));

  const documents: FormDocument[] = staff.documents.map((d) => ({
    id: d.id,
    code: d.documentType.code,
    typeName: d.documentType.name,
    number: d.number,
    expiryDate: d.expiryDate?.toISOString() ?? null,
    isLifetime: d.isLifetime,
    status: d.status,
    hasLocalFile: Boolean(d.storageKey),
    legacyUrl: d.legacyDriveUrl,
    filename: d.filename,
    fileSize: d.fileSize,
  }));

  const breadcrumbs = [
    { label: "Komite", href: "/komite" },
    { label: "Data SDM", href: "/komite/staff" },
    { label: staff.name, href: `/komite/staff/${staff.id}` },
    { label: "Edit" },
  ];

  return (
    <AppShell
      breadcrumbs={breadcrumbs}
      user={{
        name: currentUser.staff?.name ?? currentUser.username,
        email: currentUser.email,
        role: currentUser.roles[0] ?? "Staff",
      }}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Edit: {staff.name}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Perbarui identitas, pendidikan, kompetensi, dan dokumen.
          </p>
        </div>
        <StaffForm staff={formStaff} rooms={rooms} competencies={competencies} />
        <DocumentsPanel staffId={staff.id} documents={documents} />
      </div>
    </AppShell>
  );
}
