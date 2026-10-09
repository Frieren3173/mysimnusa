"use client";

import * as React from "react";
import { Table, TableHeader, TableBody, TableRow, Th, Td } from "@/components/ui/table";
import { StaffDetailButton } from "../staff/staff-detail-modal";
import { DocumentBadgeButton } from "@/components/ui/document-badge-button";
import type { DocumentFile } from "@/components/ui/document-detail-modal";
import { deriveValidity, VALIDITY_META } from "@/lib/documents";

/**
 * One row per staff member. Each document type the staff actually has becomes a
 * clickable badge that opens the shared document detail modal (Revisi 6).
 *
 * Grouping is done server-side by staff identity, so a staff member appears
 * exactly once regardless of how many documents they own.
 */

export interface StaffDocGroup {
  staffId: string;
  staffName: string;
  nip: string | null;
  profession: string;
  roomName: string | null;
  /** Documents keyed by type code, in display order. */
  types: {
    code: string;
    name: string;
    files: DocumentFile[];
  }[];
}

export function DokumenClient({
  groups,
}: {
  groups: StaffDocGroup[];
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-16 text-center">
        <p className="text-sm font-semibold text-[var(--color-foreground)]">Belum ada dokumen</p>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          Dokumen muncul setelah diunggah pada profil tenaga atau dimigrasi dari Drive.
        </p>
      </div>
    );
  }

  return (
    <Table scroll>
      <TableHeader>
        <TableRow>
          <Th className="w-12">No</Th>
          <Th>Tenaga</Th>
          <Th>NIP</Th>
          <Th>Ruangan</Th>
          <Th>Dokumen</Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((g, i) => (
          <TableRow key={g.staffId}>
            <Td className="text-xs tabular-nums text-slate-500">{i + 1}</Td>
            <Td className="text-sm font-medium">
              <StaffDetailButton staffId={g.staffId}>{g.staffName}</StaffDetailButton>
              <span className="block text-[10px] text-slate-400">{g.profession}</span>
            </Td>
            <Td className="font-mono text-xs text-slate-500">{g.nip ?? "—"}</Td>
            <Td className="text-xs">{g.roomName ?? "—"}</Td>
            <Td>
              <div className="flex flex-wrap gap-1.5">
                {g.types.length === 0 ? (
                  <span className="text-xs italic text-slate-400">Belum ada dokumen</span>
                ) : (
                  g.types.map((t) => {
                    const primary = t.files.find((f) => f.storageKey || f.legacyDriveUrl) ?? t.files[0];
                    const validity = deriveValidity(primary);
                    const meta = VALIDITY_META[validity];
                    // A document type is "available" if at least one file exists.
                    const available = t.files.some((f) => f.storageKey || f.legacyDriveUrl);
                    return (
                      <span key={t.code} className="inline-flex items-center gap-1">
                        <DocumentBadgeButton
                          staffName={g.staffName}
                          title={t.name}
                          files={t.files}
                          label={t.code}
                          variant="info"
                          title_attr={
                            available
                              ? `${t.code} — ${meta.label} · klik untuk detail`
                              : `${t.code} — berkas belum tersedia`
                          }
                        />
                      </span>
                    );
                  })
                )}
              </div>
            </Td>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
