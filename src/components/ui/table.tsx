"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// ─── Table ───────────────────────────────────────────────────

export function Table({
  className,
  children,
  /** Bounded-height scroll container so the sticky <thead> actually sticks. */
  scroll,
  ...props
}: React.HTMLAttributes<HTMLTableElement> & { scroll?: boolean }) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]",
        // `overflow-x: auto` alone does not create a scrollable box, which is why
        // a sticky <thead> had nothing to stick to. When `scroll` is set the
        // wrapper becomes the vertical scroll container for the table body only.
        scroll && "max-h-[calc(100vh-var(--page-sticky-offset,220px))] overflow-y-auto",
      )}
    >
      <table
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "bg-[var(--color-surface-raised)] border-b border-[var(--color-border)] sticky top-0 z-10 [&>tr>th]:bg-[var(--color-surface-raised)] [&>tr>th]:backdrop-blur",
        className,
      )}
      {...props}
    >
      {children}
    </thead>
  );
}

export function TableBody({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn("divide-y divide-[var(--color-border)]", className)} {...props}>
      {children}
    </tbody>
  );
}

export function TableRow({ className, children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "transition-colors duration-100 hover:bg-[var(--color-primary-subtle)]/60",
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

interface ThProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  sortable?: boolean;
  sorted?: "asc" | "desc" | false;
  onSort?: () => void;
}

export function Th({ className, sortable, sorted, onSort, children, ...props }: ThProps) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-left text-[11px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider whitespace-nowrap",
        sortable && "cursor-pointer select-none hover:text-[var(--color-foreground)]",
        className
      )}
      onClick={sortable ? onSort : undefined}
      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
      {...props}
    >
      <span className="inline-flex items-center gap-1.5">
        {children}
        {sortable && (
          <span className="text-slate-400" aria-hidden="true">
            {sorted === "asc" ? "↑" : sorted === "desc" ? "↓" : "↕"}
          </span>
        )}
      </span>
    </th>
  );
}

export function Td({ className, children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("px-4 py-3 text-[var(--color-foreground)]/90 align-middle", className)}
      {...props}
    >
      {children}
    </td>
  );
}

// ─── Pagination ──────────────────────────────────────────────

interface PaginationProps {
  page: number;
  totalPages: number;
  perPage: number;
  total: number;
  onPageChange: (page: number) => void;
  onPerPageChange?: (perPage: number) => void;
}

export function Pagination({
  page,
  totalPages,
  perPage,
  total,
  onPageChange,
  onPerPageChange,
}: PaginationProps) {
  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center gap-3">
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Menampilkan <span className="font-medium text-[var(--color-foreground)]">{start}–{end}</span> dari{" "}
          <span className="font-medium text-[var(--color-foreground)]">{total}</span>
        </p>
        {onPerPageChange && (
          <select
            value={perPage}
            onChange={(e) => onPerPageChange(Number(e.target.value))}
            className="h-7 rounded-md border border-[var(--color-border)] bg-white px-2 text-xs text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
            aria-label="Baris per halaman"
          >
            {[10, 20, 50, 100].map((v) => (
              <option key={v} value={v}>{v} / halaman</option>
            ))}
          </select>
        )}
      </div>
      <div className="flex items-center gap-1">
        <PaginationButton
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          aria-label="Halaman pertama"
        >
          «
        </PaginationButton>
        <PaginationButton
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          aria-label="Halaman sebelumnya"
        >
          ‹
        </PaginationButton>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const pageNum = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
          return (
            <PaginationButton
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              active={pageNum === page}
              aria-label={`Halaman ${pageNum}`}
              aria-current={pageNum === page ? "page" : undefined}
            >
              {pageNum}
            </PaginationButton>
          );
        })}
        <PaginationButton
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          aria-label="Halaman berikutnya"
        >
          ›
        </PaginationButton>
        <PaginationButton
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          aria-label="Halaman terakhir"
        >
          »
        </PaginationButton>
      </div>
    </div>
  );
}

function PaginationButton({
  active,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={cn(
        "h-7 min-w-[28px] rounded-md px-2 text-xs font-medium transition-colors duration-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        active
          ? "bg-[var(--color-primary)] text-white shadow-sm"
          : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-primary-subtle)] hover:text-[var(--color-primary)]"
      )}
      {...props}
    >
      {children}
    </button>
  );
}
