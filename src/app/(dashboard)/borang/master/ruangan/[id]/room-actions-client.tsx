"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, FormField } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { NURSING_ACTION_CATEGORIES } from "@/lib/master-data";

interface RoomInfo {
  id: string;
  name: string;
  code: string | null;
  type: string | null;
  description: string | null;
  isActive: boolean;
}

interface ActionOption {
  id: string;
  code: string;
  name: string;
  category: string;
  isActive: boolean;
}

export function RoomActionsClient({
  room,
  allActions,
  assignedIds,
}: {
  room: RoomInfo;
  allActions: ActionOption[];
  assignedIds: string[];
}) {
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(assignedIds));
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);

  const visible = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return allActions.filter((a) => {
      if (category && a.category !== category) return false;
      if (q && !a.name.toLowerCase().includes(q) && !a.code.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allActions, search, category]);

  const dirty =
    selected.size !== assignedIds.length || assignedIds.some((id) => !selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      visible.forEach((a) => next.add(a.id));
      return next;
    });
  }

  function unselectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      visible.forEach((a) => next.delete(a.id));
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/rooms/${room.id}/actions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionIds: Array.from(selected) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal menyimpan");
      setMsg({ type: "ok", text: `Tersimpan — ${json.data.count} tindakan aktif di ruangan ini.` });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal menyimpan" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
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

      <Card>
        <CardContent className="py-5">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <p className="text-lg font-bold text-slate-900">{room.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {room.code ? `Kode ${room.code} · ` : ""}
                {room.type ?? "Tanpa jenis"}
                {room.description ? ` · ${room.description}` : ""}
              </p>
            </div>
            <Badge variant={room.isActive ? "active" : "draft"} className="ml-auto">
              {room.isActive ? "Aktif" : "Nonaktif"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Tindakan yang tersedia{" "}
            <span className="font-normal text-slate-500">
              ({selected.size} dipilih dari {allActions.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <FormField label="Cari tindakan">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="🔍 Cari tindakan…"
                />
              </FormField>
            </div>
            <div>
              <FormField label="Filter kategori">
                <Select className="w-52" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Semua kategori</option>
                  {NURSING_ACTION_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <div className="flex gap-2 pb-0.5">
              <Button variant="secondary" size="sm" onClick={selectAllVisible} type="button">
                Pilih Semua
              </Button>
              <Button variant="secondary" size="sm" onClick={unselectAllVisible} type="button">
                Batalkan Semua
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
            {visible.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-slate-400">
                Tidak ada tindakan yang cocok dengan pencarian.
              </p>
            ) : (
              visible.map((a) => (
                <label
                  key={a.id}
                  className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(a.id)}
                    onChange={() => toggle(a.id)}
                    className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                  />
                  <span className="text-xs font-mono text-slate-400 w-16 shrink-0">{a.code}</span>
                  <span className="text-sm text-slate-800 flex-1">{a.name}</span>
                  <Badge variant="default" showDot={false} className="shrink-0">
                    {a.category}
                  </Badge>
                  {!a.isActive && (
                    <Badge variant="draft" className="shrink-0">
                      Nonaktif
                    </Badge>
                  )}
                </label>
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-500">
              {visible.length} tindakan ditampilkan · {selected.size} terpilih
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => setSelected(new Set(assignedIds))}
                disabled={!dirty || busy}
              >
                Batalkan Perubahan
              </Button>
              <Button
                variant="primary"
                size="sm"
                type="button"
                loading={busy}
                disabled={!dirty}
                onClick={save}
              >
                Simpan Perubahan
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
