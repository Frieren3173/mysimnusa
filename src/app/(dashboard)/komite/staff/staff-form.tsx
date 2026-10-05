"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, FormField, FormSection, FormActions } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";

export interface FormStaff {
  id: string;
  name: string;
  nip: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  dateOfBirth: string | null;
  profession: string;
  roomId: string | null;
  employmentStatus: string;
  isActive: boolean;
  education: { id?: string; level: string; institution: string; major: string | null; graduationYear: number | null }[];
  competencies: { code: string }[];
}

interface Props {
  staff?: FormStaff | null;
  rooms: { id: string; name: string }[];
  competencies: { code: string; name: string }[];
}

export function StaffForm({ staff, rooms, competencies }: Props) {
  const router = useRouter();
  const isEdit = Boolean(staff);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string[]>>({});

  const [form, setForm] = React.useState({
    name: staff?.name ?? "",
    nip: staff?.nip ?? "",
    profession: staff?.profession ?? "PERAWAT",
    email: staff?.email ?? "",
    phone: staff?.phone ?? "",
    address: staff?.address ?? "",
    dateOfBirth: staff?.dateOfBirth ? staff.dateOfBirth.slice(0, 10) : "",
    roomId: staff?.roomId ?? "",
    employmentStatus: staff?.employmentStatus ?? "ACTIVE",
    isActive: staff?.isActive ?? true,
  });

  const [education, setEducation] = React.useState(staff?.education ?? []);
  const [codes, setCodes] = React.useState<string[]>(
    (staff?.competencies ?? []).map((c) => c.code)
  );

  function set(key: keyof typeof form, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleCode(code: string) {
    setCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  async function submit() {
    setSaving(true);
    setError(null);
    setFields({});
    try {
      const payload = {
        name: form.name,
        nip: form.nip,
        profession: form.profession,
        email: form.email,
        phone: form.phone,
        address: form.address,
        dateOfBirth: form.dateOfBirth || undefined,
        roomId: form.roomId || null,
        employmentStatus: form.employmentStatus,
        isActive: form.isActive,
        education: education
          .filter((e) => e.level && e.institution)
          .map((e) => ({
            level: e.level,
            institution: e.institution,
            major: e.major,
            graduationYear: e.graduationYear,
          })),
        competencies: codes,
      };
      const res = await fetch(isEdit ? `/api/komite/staff/${staff!.id}` : "/api/komite/staff", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        if (json?.error?.fields) setFields(json.error.fields);
        throw new Error(json?.error?.message ?? "Gagal menyimpan data");
      }
      router.push(`/komite/staff/${isEdit ? staff!.id : json.data.staff.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan data");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{isEdit ? "Ubah Data" : "Tambah Tenaga Baru"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <FormSection title="Identitas">
            <FormField label="Nama & Gelar" required error={fields.name?.[0]}>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Ns. Nama Lengkap, S.Kep"
              />
            </FormField>
            <FormField label="NIP / NIPPPK" error={fields.nip?.[0]} hint="Kosongkan bila tidak ada">
              <Input value={form.nip} onChange={(e) => set("nip", e.target.value)} />
            </FormField>
            <FormField label="Profesi" required error={fields.profession?.[0]}>
              <Input
                value={form.profession}
                onChange={(e) => set("profession", e.target.value)}
                list="profession-list"
              />
              <datalist id="profession-list">
                <option value="PERAWAT" />
                <option value="BIDAN" />
                <option value="Tenaga Teknis Kefarmasian" />
              </datalist>
            </FormField>
            <FormField label="Ruangan">
              <Select value={form.roomId} onChange={(e) => set("roomId", e.target.value)}>
                <option value="">— Tanpa Ruangan —</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Email" error={fields.email?.[0]}>
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
              />
            </FormField>
            <FormField label="No. Handphone" error={fields.phone?.[0]}>
              <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
            </FormField>
            <FormField label="Tanggal Lahir" error={fields.dateOfBirth?.[0]}>
              <Input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => set("dateOfBirth", e.target.value)}
              />
            </FormField>
            <FormField label="Status Kepegawaian">
              <Select
                value={form.employmentStatus}
                onChange={(e) => set("employmentStatus", e.target.value)}
              >
                <option value="ACTIVE">Aktif</option>
                <option value="INACTIVE">Tidak Aktif</option>
                <option value="RESIGNED">Resigned</option>
                <option value="RETIRED">Purna Tugas</option>
              </Select>
            </FormField>
            <FormField label="Alamat" className="sm:col-span-2">
              <Textarea
                value={form.address ?? ""}
                onChange={(e) => set("address", e.target.value)}
                className="min-h-[60px]"
              />
            </FormField>
            <FormField label="Status" className="sm:col-span-2">
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => set("isActive", e.target.checked)}
                />
                Data aktif (ditampilkan di dashboard & laporan)
              </label>
            </FormField>
          </FormSection>

          <FormSection title="Pendidikan">
            {education.length === 0 && (
              <p className="text-xs text-slate-400 italic sm:col-span-2">
                Belum ada riwayat pendidikan.
              </p>
            )}
            {education.map((e, i) => (
              <div key={i} className="sm:col-span-2 grid grid-cols-12 gap-2 items-end">
                <div className="col-span-3">
                  <FormField label="Jenjang">
                    <Select
                      value={e.level}
                      onChange={(ev) =>
                        setEducation((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, level: ev.target.value } : x))
                        )
                      }
                    >
                      <option value="">—</option>
                      {["D3", "D4", "S1", "S2", "S3", "SPK", "SMA/SMK"].map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                </div>
                <div className="col-span-5">
                  <FormField label="Institusi">
                    <Input
                      value={e.institution}
                      onChange={(ev) =>
                        setEducation((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, institution: ev.target.value } : x))
                        )
                      }
                    />
                  </FormField>
                </div>
                <div className="col-span-3">
                  <FormField label="Tahun Lulus">
                    <Input
                      type="number"
                      value={e.graduationYear ?? ""}
                      onChange={(ev) =>
                        setEducation((prev) =>
                          prev.map((x, j) =>
                            j === i
                              ? { ...x, graduationYear: ev.target.value ? Number(ev.target.value) : null }
                              : x
                          )
                        )
                      }
                    />
                  </FormField>
                </div>
                <div className="col-span-1 pb-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setEducation((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 size={14} className="text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="sm:col-span-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setEducation((prev) => [...prev, { level: "", institution: "", major: null, graduationYear: null }])
                }
              >
                <Plus size={14} /> Tambah Pendidikan
              </Button>
            </div>
          </FormSection>

          <FormSection title="Kompetensi Klinis">
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              {competencies.map((c) => {
                const active = codes.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggleCode(c.code)}
                    className={`rounded px-2.5 py-1 text-xs font-medium border transition-colors ${
                      active
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
              {codes.length > 0 && (
                <Badge variant="default" showDot={false} className="ml-1">
                  {codes.length} dipilih
                </Badge>
              )}
            </div>
          </FormSection>

          <FormActions>
            <Button variant="secondary" onClick={() => router.back()} type="button">
              Batal
            </Button>
            <Button variant="primary" loading={saving} onClick={submit} type="button">
              {isEdit ? "Simpan Perubahan" : "Simpan Data"}
            </Button>
          </FormActions>
        </CardContent>
      </Card>
    </div>
  );
}
