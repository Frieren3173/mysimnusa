"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, FormField } from "@/components/ui/form";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, UserPlus } from "lucide-react";

interface RoleOption {
  name: string;
  description: string | null;
}
interface UserRow {
  id: string;
  username: string;
  email: string;
  isActive: boolean;
  lastLoginAt: Date | string | null;
  createdAt: Date | string;
  staff: { id: string; name: string } | null;
  userRoles: { role: RoleOption }[];
}

const EMPTY = { username: "", email: "", password: "" };

export function UsersClient({
  initialUsers,
  roles,
  meId,
}: {
  initialUsers: UserRow[];
  roles: RoleOption[];
  meId: string;
}) {
  const [users, setUsers] = React.useState(initialUsers);
  const [form, setForm] = React.useState(EMPTY);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [active, setActive] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const payload: Record<string, unknown> = {
        username: form.username.trim(),
        email: form.email.trim(),
        isActive: active,
        roles: selected,
      };
      if (form.password) payload.password = form.password;
      const res = await fetch(editId ? `/api/admin/users/${editId}` : "/api/admin/users", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal menyimpan");

      // refresh list
      const listRes = await fetch("/api/admin/users?perPage=100");
      const listJson = await listRes.json();
      if (listJson?.success) setUsers(listJson.data.data);

      setMsg({ type: "ok", text: editId ? "Pengguna diperbarui." : "Pengguna ditambahkan." });
      resetForm();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal menyimpan" });
      setError(e instanceof Error ? e.message : null);
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setForm(EMPTY);
    setEditId(null);
    setSelected([]);
    setActive(true);
  }

  function startEdit(u: UserRow) {
    setEditId(u.id);
    setForm({ username: u.username, email: u.email, password: "" });
    setSelected(u.userRoles.map((r) => r.role.name));
    setActive(u.isActive);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(u: UserRow) {
    if (!confirm(`Hapus pengguna "${u.username}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Gagal menghapus");
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      if (editId === u.id) resetForm();
      setMsg({ type: "ok", text: "Pengguna dihapus." });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Gagal menghapus" });
    } finally {
      setBusy(false);
    }
  }

  function toggleRole(name: string) {
    setSelected((prev) => (prev.includes(name) ? prev.filter((r) => r !== name) : [...prev, name]));
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

      {/* Form (create / edit) */}
      <Card>
        <CardHeader>
          <CardTitle>{editId ? `Edit Pengguna: ${form.username}` : "Tambah Pengguna"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="Username" required>
              <Input
                value={form.username}
                onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                placeholder="nama.pengguna"
              />
            </FormField>
            <FormField label="Email" required hint="Dapat diubah kapan saja">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="nama@rsajt.go.id"
              />
            </FormField>
            <FormField
              label="Password"
              required={!editId}
              hint={editId ? "Kosongkan bila tidak diganti" : "Minimal 8 karakter"}
            >
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder={editId ? "••••••••" : ""}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Peran (Role)">
              <div className="flex flex-wrap gap-2 pt-1">
                {roles.map((r) => {
                  const on = selected.includes(r.name);
                  return (
                    <button
                      key={r.name}
                      type="button"
                      onClick={() => toggleRole(r.name)}
                      className={`rounded px-2.5 py-1 text-xs font-medium border transition-colors ${
                        on
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                      }`}
                      title={r.description ?? r.name}
                    >
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </FormField>
            <FormField label="Status">
              <label className="flex items-center gap-2 text-xs text-slate-700 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                Akun aktif (dapat login)
              </label>
            </FormField>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            {editId && (
              <Button variant="secondary" size="sm" onClick={resetForm} type="button">
                Batal Edit
              </Button>
            )}
            <Button variant="primary" size="sm" loading={busy} onClick={submit} type="button">
              <UserPlus size={14} /> {editId ? "Simpan Perubahan" : "Tambah Pengguna"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle>Daftar Pengguna ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table scroll>
            <TableHeader>
              <TableRow>
                <Th>Username</Th>
                <Th>Email</Th>
                <Th>Peran</Th>
                <Th>Status</Th>
                <Th>Login Terakhir</Th>
                <Th></Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <Td>
                    <p className="text-sm font-medium text-slate-900">{u.username}</p>
                    {u.staff && <p className="text-[10px] text-slate-400">{u.staff.name}</p>}
                  </Td>
                  <Td className="text-xs text-slate-600">{u.email}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {u.userRoles.length === 0 ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        u.userRoles.map((r) => (
                          <Badge key={r.role.name} variant="info" showDot={false}>
                            {r.role.name}
                          </Badge>
                        ))
                      )}
                    </div>
                  </Td>
                  <Td>
                    <Badge variant={u.isActive ? "active" : "default"}>
                      {u.isActive ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </Td>
                  <Td className="text-xs text-slate-500">
                    {u.lastLoginAt
                      ? new Date(u.lastLoginAt).toLocaleString("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "Belum pernah"}
                  </Td>
                  <Td className="text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="icon-sm" title="Edit" onClick={() => startEdit(u)}>
                        <Pencil size={14} className="text-slate-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Hapus"
                        disabled={u.id === meId || busy}
                        onClick={() => remove(u)}
                      >
                        <Trash2 size={14} className="text-red-500" />
                      </Button>
                    </div>
                  </Td>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
