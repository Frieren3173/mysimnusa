import * as React from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { BORANG_STATUS_LABEL, BORANG_STATUS_VARIANT } from "@/lib/borang-workflow";

// ─── Badge / Status Badge ───────────────────────────────────

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
  {
    variants: {
      variant: {
        default:   "bg-[var(--color-surface-raised)] text-[var(--color-muted-foreground)] ring-[var(--color-border)]",
        active:    "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
        expiring:  "bg-amber-50 text-amber-700 ring-amber-200/70",
        expired:   "bg-red-50 text-red-700 ring-red-200/70",
        lifetime:  "bg-[var(--color-primary-subtle)] text-[var(--color-primary)] ring-[var(--color-primary)]/20",
        missing:   "bg-red-50 text-red-600 ring-red-200/70",
        pending:   "bg-[var(--color-primary-subtle)] text-[var(--color-primary)] ring-[var(--color-primary)]/20",
        approved:  "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
        rejected:  "bg-red-50 text-red-700 ring-red-200/70",
        draft:     "bg-[var(--color-surface-raised)] text-[var(--color-muted-foreground)] ring-[var(--color-border)]",
        submitted: "bg-[var(--color-primary-subtle)] text-[var(--color-primary)] ring-[var(--color-primary)]/20",
        archived:  "bg-[var(--color-surface-raised)] text-[var(--color-muted-foreground)] ring-[var(--color-border)]",
        info:      "bg-[var(--color-primary-subtle)] text-[var(--color-primary)] ring-[var(--color-primary)]/20",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

const STATUS_DOTS: Record<string, string> = {
  active:   "bg-emerald-500",
  approved: "bg-emerald-500",
  expiring: "bg-amber-500",
  expired:  "bg-red-500",
  missing:  "bg-red-500",
  rejected: "bg-red-500",
  lifetime: "bg-[var(--color-primary)]",
  pending:  "bg-[var(--color-primary)]",
  submitted:"bg-[var(--color-primary)]",
  draft:    "bg-slate-400",
  archived: "bg-slate-400",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  showDot?: boolean;
}

export function Badge({ className, variant, showDot = true, children, ...props }: BadgeProps) {
  const dot = STATUS_DOTS[variant ?? "default"];
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {showDot && dot && (
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dot)} aria-hidden="true" />
      )}
      {children}
    </span>
  );
}

// ─── Status Badge (semantic from DocumentStatus / BorangStatus) ─

const DOCUMENT_STATUS_LABELS: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  ACTIVE:    { label: "Aktif", variant: "active" },
  EXPIRING:  { label: "Akan Berakhir", variant: "expiring" },
  EXPIRED:   { label: "Expired", variant: "expired" },
  LIFETIME:  { label: "Seumur Hidup", variant: "lifetime" },
  MISSING:   { label: "Belum Tersedia", variant: "missing" },
};

const TRAINING_STATUS_LABELS: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  DRAFT:     { label: "Draft", variant: "draft" },
  PUBLISHED: { label: "Terbuka", variant: "info" },
  ONGOING:   { label: "Berlangsung", variant: "active" },
  COMPLETED: { label: "Selesai", variant: "approved" },
  CANCELLED: { label: "Dibatalkan", variant: "expired" },
};

export function DocumentStatusBadge({ status, label }: { status: string; label?: string }) {
  const entry = DOCUMENT_STATUS_LABELS[status] ?? { label: status, variant: "default" as const };
  return <Badge variant={entry.variant}>{label ?? entry.label}</Badge>;
}

/**
 * Borang status badge.
 *
 * Labels/variants come from `@/lib/borang-workflow` (single source of truth)
 * so the full Kepala Ruang workflow — REVISION_REQUIRED, APPROVED_KARU,
 * READY_TO_PRINT, PRINTED, COMPLETED — renders correctly, while legacy
 * statuses keep their existing appearance.
 */
export function BorangStatusBadge({ status }: { status: string }) {
  const label = BORANG_STATUS_LABEL[status] ?? status;
  const variant = (BORANG_STATUS_VARIANT[status] ?? "default") as BadgeProps["variant"];
  return <Badge variant={variant}>{label}</Badge>;
}

export function TrainingStatusBadge({ status }: { status: string }) {
  const { label, variant } = TRAINING_STATUS_LABELS[status] ?? { label: status, variant: "default" as const };
  return <Badge variant={variant}>{label}</Badge>;
}
