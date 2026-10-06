"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, TrainingStatusBadge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { CheckCircle2, Trash2, Award, UserPlus } from "lucide-react";

export interface TrainingOption {
  id: string;
  title: string;
  status: string;
  startDate: string;
  endDate: string;
  location: string | null;
}

interface Participant {
  id: string;
  staffId: string;
  status: string;
  registeredAt: string;
  staff: { id: string; name: string; profession: string; nip: string | null };
}
interface Attendance {
  id: string;
  staffId: string;
  date: string;
  status: string;
}
interface Assessment {
  id: string;
  staffId: string;
  score: number | null;
  grade: string | null;
}
interface Certificate {
  id: string;
  staffId: string;
  certificateNumber: string;
  issuedDate: string;
}
interface Detail {
  id: string;
  title: string;
  status: string;
  startDate: string;
  endDate: string;
  location: string | null;
  capacity: number | null;
  description: string | null;
  participants: Participant[];
  attendance: Attendance[];
  assessments: Assessment[];
  certificates: Certificate[];
}
interface StaffOpt {
  id: string;
  name: string;
  profession: string;
}

type Tab = "participants" | "attendance" | "assessment" | "certificates";

const TABS: { key: Tab; label: string }[] = [
  { key: "participants", label: "Peserta" },
  { key: "attendance", label: "Presensi" },
  { key: "assessment", label: "Penilaian" },
  { key: "certificates", label: "Sertifikat" },
];

const ATT_STATUSES = ["HADIR", "TIDAK_HADIR", "SAKIT", "IZIN"] as const;

export function TrainingManager({
  trainings,
  defaultTab,
  initialTrainingId,
  perms,
}: {
  trainings: TrainingOption[];
  defaultTab: Tab;
  initialTrainingId?: string;
  perms: {
    manageParticipants: boolean;
    manageAttendance: boolean;
    manageAssessment: boolean;
    issueCertificate: boolean;
  };
}) {
  const [trainingId, setTrainingId] = React.useState<string>(initialTrainingId ?? trainings[0]?.id ?? "");
  const [tab, setTab] = React.useState<Tab>(defaultTab);
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [staffList, setStaffList] = React.useState<StaffOpt[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [addStaffId, setAddStaffId] = React.useState("");
  const [attDate, setAttDate] = React.useState(() => new Date().toISOString().slice(0, 10));

  const setErr = (e: unknown) =>
    setMsg({ type: "err", text: e instanceof Error ? e.message : "Terjadi kesalahan" });

  const load = React.useCallback(async (id: string) => {
    if (!id) {
      setDetail(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/diklat/trainings/${id}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal memuat pelatihan");
      setDetail(json.data.training);
    } catch (e) {
      setErr(e);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => load(trainingId), 0);
    return () => clearTimeout(timer);
  }, [trainingId, load]);

  React.useEffect(() => {
    if (tab === "participants" && staffList.length === 0) {
      fetch("/api/komite/staff?perPage=200")
        .then((r) => r.json())
        .then((j) => setStaffList(j?.success ? (j.data.data as StaffOpt[]) : []))
        .catch(() => {});
    }
  }, [tab, staffList.length]);

  async function call(url: string, init: RequestInit, key: string, okMsg: string) {
    setBusy(key);
    setMsg(null);
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", ...init.headers },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal memproses");
      setMsg({ type: "ok", text: okMsg });
      await load(trainingId);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(null);
    }
  }

  const selected = trainings.find((t) => t.id === trainingId);
  const participants = detail?.participants ?? [];
  const attFor = (staffId: string) =>
    detail?.attendance.find(
      (a) => a.staffId === staffId && a.date.slice(0, 10) === attDate
    );
  const certFor = (staffId: string) => detail?.certificates.find((c) => c.staffId === staffId);
  const availableStaff = staffList.filter(
    (s) => !participants.some((p) => p.staffId === s.id)
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="text-xs text-slate-500">Pelatihan</span>
          <select
            value={trainingId}
            onChange={(e) => setTrainingId(e.target.value)}
            className="h-9 min-w-[320px] rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
          >
            <option value="">— Pilih pelatihan —</option>
            {trainings.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} ({new Date(t.startDate).toLocaleDateString("id-ID")})
              </option>
            ))}
          </select>
        </label>
        {selected && <TrainingStatusBadge status={selected.status} />}
      </div>

      {msg && (
        <div
          role="status"
          className={`rounded-md border px-4 py-2.5 text-xs ${
            msg.type === "ok"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!trainingId ? (
        <Card>
          <CardContent className="p-8 text-center text-xs text-slate-400">
            Pilih pelatihan terlebih dahulu.
          </CardContent>
        </Card>
      ) : loading || !detail ? (
        <Card>
          <CardContent className="p-8 text-center text-xs text-slate-400">Memuat…</CardContent>
        </Card>
      ) : (
        <>
          <div className="text-xs text-slate-500">
            <span className="font-medium text-slate-700">{detail.title}</span>
            {" · "}
            {new Date(detail.startDate).toLocaleDateString("id-ID")} –{" "}
            {new Date(detail.endDate).toLocaleDateString("id-ID")}
            {detail.location ? ` · ${detail.location}` : ""}
            {detail.capacity ? ` · Kuota ${detail.capacity}` : ""}
          </div>

          {tab === "participants" && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Peserta ({participants.length})</CardTitle>
                {perms.manageParticipants && (
                  <div className="flex items-center gap-2">
                    <select
                      value={addStaffId}
                      onChange={(e) => setAddStaffId(e.target.value)}
                      className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
                    >
                      <option value="">— Pilih petugas —</option>
                      {availableStaff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} — {s.profession}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!addStaffId || busy !== null}
                      loading={busy === "addP"}
                      onClick={() =>
                        call(
                          `/api/diklat/trainings/${trainingId}/participants`,
                          { method: "POST", body: JSON.stringify({ staffId: addStaffId }) },
                          "addP",
                          "Peserta ditambahkan."
                        ).then(() => setAddStaffId(""))
                      }
                    >
                      <UserPlus size={12} /> Tambah
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0">
                <Table scroll>
                  <TableHeader>
                    <TableRow>
                      <Th>Nama</Th>
                      <Th>Profesi</Th>
                      <Th>NIP</Th>
                      <Th>Terdaftar</Th>
                      <Th>Status</Th>
                      <Th></Th>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {participants.length === 0 ? (
                      <TableRow>
                        <Td colSpan={6} className="text-center text-xs text-slate-400 py-6">
                          Belum ada peserta.
                        </Td>
                      </TableRow>
                    ) : (
                      participants.map((p) => (
                        <TableRow key={p.id}>
                          <Td className="text-xs font-medium">{p.staff.name}</Td>
                          <Td className="text-xs">{p.staff.profession}</Td>
                          <Td className="text-xs font-mono">{p.staff.nip ?? "—"}</Td>
                          <Td className="text-xs text-slate-500">
                            {new Date(p.registeredAt).toLocaleDateString("id-ID")}
                          </Td>
                          <Td>
                            {perms.manageParticipants ? (
                              <select
                                value={p.status}
                                disabled={busy === p.id}
                                onChange={(e) =>
                                  call(
                                    `/api/diklat/trainings/${trainingId}/participants/${p.id}`,
                                    { method: "PATCH", body: JSON.stringify({ status: e.target.value }) },
                                    p.id,
                                    "Status peserta diperbarui."
                                  )
                                }
                                className="h-7 rounded border border-slate-300 bg-white px-1.5 text-[11px]"
                              >
                                <option value="REGISTERED">Terdaftar</option>
                                <option value="CONFIRMED">Dikonfirmasi</option>
                                <option value="CANCELLED">Dibatalkan</option>
                              </select>
                            ) : (
                              <Badge
                                variant={
                                  p.status === "CANCELLED"
                                    ? "expired"
                                    : p.status === "CONFIRMED"
                                      ? "active"
                                      : "default"
                                }
                              >
                                {p.status}
                              </Badge>
                            )}
                          </Td>
                          <Td className="text-right">
                            {perms.manageParticipants && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy !== null}
                                loading={busy === "del" + p.id}
                                onClick={() => {
                                  if (!confirm(`Hapus ${p.staff.name} dari peserta?`)) return;
                                  call(
                                    `/api/diklat/trainings/${trainingId}/participants/${p.id}`,
                                    { method: "DELETE" },
                                    "del" + p.id,
                                    "Peserta dihapus."
                                  );
                                }}
                              >
                                <Trash2 size={12} />
                              </Button>
                            )}
                          </Td>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {tab === "attendance" && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Presensi Harian</CardTitle>
                <input
                  type="date"
                  value={attDate}
                  onChange={(e) => setAttDate(e.target.value)}
                  className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
                />
              </CardHeader>
              <CardContent className="p-0">
                <Table scroll>
                  <TableHeader>
                    <TableRow>
                      <Th>Peserta</Th>
                      <Th>Status Presensi</Th>
                      <Th>Catatan Tercatat</Th>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {participants.length === 0 ? (
                      <TableRow>
                        <Td colSpan={3} className="text-center text-xs text-slate-400 py-6">
                          Tidak ada peserta.
                        </Td>
                      </TableRow>
                    ) : (
                      participants.map((p) => {
                        const a = attFor(p.staffId);
                        return (
                          <TableRow key={p.id}>
                            <Td className="text-xs font-medium">{p.staff.name}</Td>
                            <Td>
                              {perms.manageAttendance ? (
                                <select
                                  value={a?.status ?? ""}
                                  disabled={busy === "att" + p.staffId}
                                  onChange={(e) =>
                                    call(
                                      `/api/diklat/trainings/${trainingId}/attendance`,
                                      {
                                        method: "POST",
                                        body: JSON.stringify({
                                          staffId: p.staffId,
                                          date: attDate,
                                          status: e.target.value,
                                        }),
                                      },
                                      "att" + p.staffId,
                                      "Presensi tersimpan."
                                    )
                                  }
                                  className="h-7 rounded border border-slate-300 bg-white px-1.5 text-[11px]"
                                >
                                  <option value="">— belum —</option>
                                  {ATT_STATUSES.map((s) => (
                                    <option key={s} value={s}>
                                      {s.replace("_", " ")}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <Badge variant={a?.status === "HADIR" ? "active" : "missing"}>
                                  {a?.status ?? "—"}
                                </Badge>
                              )}
                            </Td>
                            <Td className="text-[11px] text-slate-400">{a ? a.date.slice(0, 10) : "—"}</Td>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {tab === "assessment" && (
            <AssessmentPanel
              trainingId={trainingId}
              participants={participants}
              assessments={detail.assessments}
              canEdit={perms.manageAssessment}
              busy={busy}
              onCall={call}
            />
          )}

          {tab === "certificates" && (
            <Card>
              <CardHeader>
                <CardTitle>Sertifikat</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table scroll>
                  <TableHeader>
                    <TableRow>
                      <Th>Peserta</Th>
                      <Th>Nomor Sertifikat</Th>
                      <Th>Tanggal Terbit</Th>
                      <Th></Th>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {participants.length === 0 ? (
                      <TableRow>
                        <Td colSpan={4} className="text-center text-xs text-slate-400 py-6">
                          Tidak ada peserta.
                        </Td>
                      </TableRow>
                    ) : (
                      participants.map((p) => {
                        const c = certFor(p.staffId);
                        return (
                          <TableRow key={p.id}>
                            <Td className="text-xs font-medium">{p.staff.name}</Td>
                            <Td className="text-xs font-mono">{c?.certificateNumber ?? "—"}</Td>
                            <Td className="text-xs text-slate-500">
                              {c ? new Date(c.issuedDate).toLocaleDateString("id-ID") : "—"}
                            </Td>
                            <Td className="text-right">
                              {!c && perms.issueCertificate && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  disabled={busy !== null}
                                  loading={busy === "cert" + p.staffId}
                                  onClick={() =>
                                    call(
                                      `/api/diklat/trainings/${trainingId}/certificates`,
                                      { method: "POST", body: JSON.stringify({ staffId: p.staffId }) },
                                      "cert" + p.staffId,
                                      "Sertifikat diterbitkan."
                                    )
                                  }
                                >
                                  <Award size={12} /> Terbitkan
                                </Button>
                              )}
                            </Td>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function AssessmentPanel({
  trainingId,
  participants,
  assessments,
  canEdit,
  busy,
  onCall,
}: {
  trainingId: string;
  participants: Participant[];
  assessments: Assessment[];
  canEdit: boolean;
  busy: string | null;
  onCall: (url: string, init: RequestInit, key: string, okMsg: string) => Promise<void>;
}) {
  const [scores, setScores] = React.useState<Record<string, string>>({});
  const gradeOf = (score: number) => (score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "E");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Penilaian</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table scroll>
          <TableHeader>
            <TableRow>
              <Th>Peserta</Th>
              <Th>Nilai (0–100)</Th>
              <Th>Grade</Th>
              <Th>Tersimpan</Th>
              <Th></Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {participants.length === 0 ? (
              <TableRow>
                <Td colSpan={5} className="text-center text-xs text-slate-400 py-6">
                  Tidak ada peserta.
                </Td>
              </TableRow>
            ) : (
              participants.map((p) => {
                const a = assessments.find((x) => x.staffId === p.staffId);
                const val = scores[p.staffId] ?? (a?.score != null ? String(a.score) : "");
                const num = Number(val);
                return (
                  <TableRow key={p.id}>
                    <Td className="text-xs font-medium">{p.staff.name}</Td>
                    <Td>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={val}
                        disabled={!canEdit}
                        onChange={(e) => setScores((s) => ({ ...s, [p.staffId]: e.target.value }))}
                        className="h-7 w-20 rounded border border-slate-300 bg-white px-2 text-xs"
                      />
                    </Td>
                    <Td className="text-xs font-semibold">
                      {val !== "" && !Number.isNaN(num) ? gradeOf(num) : (a?.grade ?? "—")}
                    </Td>
                    <Td className="text-[11px] text-slate-400">
                      {a?.score != null ? `${a.score}${a.grade ? ` (${a.grade})` : ""}` : "—"}
                    </Td>
                    <Td className="text-right">
                      {canEdit && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={val === "" || Number.isNaN(num) || busy !== null}
                          loading={busy === "score" + p.staffId}
                          onClick={() =>
                            onCall(
                              `/api/diklat/trainings/${trainingId}/assessments`,
                              { method: "POST", body: JSON.stringify({ staffId: p.staffId, score: num }) },
                              "score" + p.staffId,
                              "Nilai tersimpan."
                            )
                          }
                        >
                          <CheckCircle2 size={12} /> Simpan
                        </Button>
                      )}
                    </Td>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
