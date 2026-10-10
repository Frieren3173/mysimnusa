"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Settings2 } from "lucide-react";
import { CERTIFICATE_MODES, type CertificateMode } from "@/lib/diklat/certificate-policy";

export interface PolicyState {
  certificateMode: CertificateMode;
  requireTest: boolean;
  requireMinScore: boolean;
  minScore: string;
  showScore: boolean;
  /**
   * @deprecated LEGACY field, kept only so the parent state shape is unchanged.
   * The UI no longer edits it (attendance is binary). The parent stops sending
   * it on save, so any stored value is preserved untouched.
   */
  minAttendanceRate: string;
}

export function policyFromTraining(t: {
  certificateMode?: string | null;
  requireTest?: boolean | null;
  requireMinScore?: boolean | null;
  minScore?: number | null;
  showScore?: boolean | null;
  minAttendanceRate?: number | null;
}): PolicyState {
  const mode = (CERTIFICATE_MODES as readonly string[]).includes(t.certificateMode ?? "")
    ? (t.certificateMode as CertificateMode)
    : "ATTENDANCE_ONLY";
  return {
    certificateMode: mode,
    requireTest: Boolean(t.requireTest),
    requireMinScore: Boolean(t.requireMinScore),
    minScore: t.minScore != null ? String(t.minScore) : "",
    showScore: Boolean(t.showScore),
    minAttendanceRate: t.minAttendanceRate != null ? String(t.minAttendanceRate) : "",
  };
}

const MODE_HELP: Record<CertificateMode, string> = {
  ATTENDANCE_ONLY: "Mode A — sertifikat layak dari kehadiran saja (tanpa pretest/post-test).",
  TEST_SCORED: "Mode B — peserta wajib menyelesaikan tes; nilai dicatat. Nilai minimum opsional.",
  TEST_COMPLETION: "Mode C — tes selesai = memenuhi syarat. Nilai minimum opsional.",
};

export function CertificatePolicyPanel({
  policy,
  canEdit,
  busy,
  onSave,
}: {
  policy: PolicyState;
  canEdit: boolean;
  busy: boolean;
  onSave: (p: PolicyState) => void;
}) {
  // Initialised from props; the parent remounts this panel with a `key` per
  // activity (and after each save), so no state-sync effect is needed.
  const [draft, setDraft] = React.useState<PolicyState>(policy);

  const isTestMode = draft.certificateMode === "TEST_SCORED" || draft.certificateMode === "TEST_COMPLETION";

  function set<K extends keyof PolicyState>(k: K, v: PolicyState[K]) {
    setDraft((p) => ({ ...p, [k]: v }));
  }

  const dirty =
    draft.certificateMode !== policy.certificateMode ||
    draft.requireTest !== policy.requireTest ||
    draft.requireMinScore !== policy.requireMinScore ||
    draft.minScore !== policy.minScore ||
    draft.showScore !== policy.showScore;
  // NOTE: minAttendanceRate is intentionally NOT part of `dirty` — it is a
  // legacy percentage field with no operational effect (attendance is binary).

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 size={16} /> Kebijakan Sertifikat
        </CardTitle>
        <CardDescription>{MODE_HELP[draft.certificateMode]}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-slate-500">Mode Penerbitan</span>
            <Select
              value={draft.certificateMode}
              disabled={!canEdit || busy}
              onChange={(e) => set("certificateMode", e.target.value as CertificateMode)}
            >
              <option value="ATTENDANCE_ONLY">A — Kehadiran saja</option>
              <option value="TEST_SCORED">B — Tes dengan nilai</option>
              <option value="TEST_COMPLETION">C — Tes selesai = syarat</option>
            </Select>
          </label>

          <div className="space-y-1">
            <span className="text-xs text-slate-500">Syarat Kehadiran</span>
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Minimal <strong>1 kehadiran (HADIR)</strong>. Kehadiran bersifat biner — 1× HADIR berarti
              peserta dianggap mengikuti seluruh kegiatan dan memperoleh bobot JPL penuh. Tidak ada
              perhitungan persentase kehadiran.
            </p>
          </div>
        </div>

        {(isTestMode || draft.requireTest) && (
          <div className="flex flex-wrap items-center gap-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs">
            {!isTestMode && (
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={draft.requireTest}
                  disabled={!canEdit || busy}
                  onChange={(e) => set("requireTest", e.target.checked)}
                />
                Wajib menyelesaikan tes
              </label>
            )}
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={draft.requireMinScore}
                disabled={!canEdit || busy}
                onChange={(e) => set("requireMinScore", e.target.checked)}
              />
              Aktifkan syarat nilai minimum
            </label>
            {draft.requireMinScore && (
              <label className="flex items-center gap-1.5">
                <span className="text-slate-500">Nilai min</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.minScore}
                  disabled={!canEdit || busy}
                  onChange={(e) => set("minScore", e.target.value)}
                  className="h-7 w-20 rounded border border-slate-300 bg-white px-2 text-xs disabled:bg-slate-100"
                />
              </label>
            )}
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={draft.showScore}
                disabled={!canEdit || busy}
                onChange={(e) => set("showScore", e.target.checked)}
              />
              Cantumkan nilai pada sertifikat
            </label>
          </div>
        )}

        {canEdit && (
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              disabled={!dirty || busy}
              loading={busy}
              onClick={() => onSave(draft)}
            >
              Simpan Kebijakan
            </Button>
          </div>
        )}
        <p className="text-[11px] text-[var(--text-muted,var(--color-muted-foreground))]">
          Perubahan kebijakan tidak mengubah sertifikat yang sudah terbit.
        </p>
      </CardContent>
    </Card>
  );
}
