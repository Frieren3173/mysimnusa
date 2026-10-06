import * as React from "react";
import { cn } from "@/lib/utils";

// ─── Card ────────────────────────────────────────────────────

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(15,40,70,0.04),0_1px_3px_rgba(15,40,70,0.03)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-6 py-4 border-b border-[var(--color-border)]", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-sm font-semibold text-[var(--color-foreground)]", className)} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-xs text-[var(--color-muted-foreground)] mt-0.5", className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-6 py-4", className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-6 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface-raised)]/60 rounded-b-xl", className)} {...props}>
      {children}
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; label: string };
  icon?: React.ReactNode;
  variant?: "default" | "warning" | "danger" | "success";
  action?: React.ReactNode;
  size?: "default" | "large";
  className?: string;
}

const KPI_VARIANTS = {
  default: "border-[var(--color-border)]",
  warning: "border-amber-200 bg-amber-50/40",
  danger:  "border-red-200 bg-red-50/40",
  success: "border-green-200 bg-green-50/40",
};

export function KpiCard({
  title,
  value,
  subtitle,
  trend,
  icon,
  variant = "default",
  action,
  size = "default",
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "group relative rounded-xl border bg-[var(--color-surface)] p-5",
        "shadow-[0_1px_2px_rgba(15,40,70,0.04)]",
        "transition-[transform,box-shadow,border-color] duration-200 ease-[var(--ease-standard)]",
        "hover:-translate-y-0.5 hover:shadow-[0_6px_16px_-6px_rgba(15,40,70,0.18)]",
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        KPI_VARIANTS[variant],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium leading-snug text-[var(--color-muted-foreground)]">
          {title}
        </p>
        {icon && (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--color-primary-subtle)] text-[var(--color-primary)]">
            {icon}
          </div>
        )}
      </div>

      <p
        className={cn(
          "mt-2.5 font-bold leading-none tabular-nums tracking-[-0.02em] text-[var(--color-foreground)]",
          size === "large" ? "text-[2.5rem]" : "text-[2rem]",
        )}
      >
        {value}
      </p>

      {subtitle && (
        <p className="mt-1.5 text-xs leading-snug text-[var(--color-muted-foreground)]">{subtitle}</p>
      )}
      {trend && (
        <p className={cn("mt-1.5 text-xs font-medium", trend.value >= 0 ? "text-green-600" : "text-red-600")}>
          {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)} {trend.label}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ─── Section ─────────────────────────────────────────────────

interface SectionProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

export function Section({ title, description, action, className, children, ...props }: SectionProps) {
  return (
    <section className={cn("space-y-3.5", className)} {...props}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-foreground)]">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0 pb-0.5">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

// ─── Skeleton ────────────────────────────────────────────────

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-[var(--color-surface-sunken)]", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export function SkeletonCard() {
  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-3 w-1/4" />
      </CardContent>
    </Card>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-10 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary-subtle)] text-[var(--color-primary)]">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-[var(--color-foreground)]">{title}</h3>
      {description && (
        <p className="text-xs text-[var(--color-muted-foreground)] mt-1 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ─── Alert / Attention Item ──────────────────────────────────

interface AlertItemProps {
  type: "warning" | "danger" | "info" | "success";
  title: string;
  description?: string;
  action?: React.ReactNode;
  count?: number;
}

const ALERT_STYLES = {
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger:  "border-red-200 bg-red-50 text-red-800",
  info:    "border-blue-200 bg-blue-50 text-blue-800",
  success: "border-green-200 bg-green-50 text-green-800",
};

export function AlertItem({ type, title, description, action, count }: AlertItemProps) {
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5", ALERT_STYLES[type])}>
      <div className="flex min-w-0 items-center gap-3">
        {count !== undefined && (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/70 text-sm font-bold tabular-nums">
            {count}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          {description && <p className="mt-0.5 text-xs opacity-80">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0 text-xs">{action}</div>}
    </div>
  );
}
