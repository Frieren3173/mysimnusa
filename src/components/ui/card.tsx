import * as React from "react";
import { cn } from "@/lib/utils";

// ─── Card ────────────────────────────────────────────────────

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-white shadow-sm",
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
    <div className={cn("flex items-center justify-between px-6 py-4 border-b border-slate-100", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-sm font-semibold text-slate-900", className)} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-xs text-slate-500 mt-0.5", className)} {...props}>
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
    <div className={cn("px-6 py-3 border-t border-slate-100 bg-slate-50/50 rounded-b-lg", className)} {...props}>
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
}

const KPI_VARIANTS = {
  default: "border-slate-200",
  warning: "border-amber-200 bg-amber-50/30",
  danger:  "border-red-200 bg-red-50/30",
  success: "border-green-200 bg-green-50/30",
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
}: KpiCardProps) {
  return (
    <div className={cn("rounded-lg border bg-white p-5 shadow-sm", KPI_VARIANTS[variant])}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide truncate">
            {title}
          </p>
          <p
            className={cn(
              "font-bold tabular-nums text-slate-900 mt-1",
              size === "large" ? "text-4xl" : "text-3xl"
            )}
          >
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
          )}
          {trend && (
            <p className={cn("text-xs mt-1 font-medium", trend.value >= 0 ? "text-green-600" : "text-red-600")}>
              {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)} {trend.label}
            </p>
          )}
        </div>
        {icon && (
          <div className="shrink-0 text-slate-400">{icon}</div>
        )}
      </div>
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
    <section className={cn("space-y-4", className)} {...props}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
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
      className={cn("animate-pulse rounded bg-slate-100", className)}
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
        <div className="mb-4 text-slate-300">{icon}</div>
      )}
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      {description && (
        <p className="text-xs text-slate-500 mt-1 max-w-sm">{description}</p>
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
    <div className={cn("rounded-md border px-4 py-3 flex items-center justify-between gap-3", ALERT_STYLES[type])}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {count !== undefined && (
            <span className="text-base font-bold tabular-nums">{count}</span>
          )}
          <p className="text-sm font-medium truncate">{title}</p>
        </div>
        {description && <p className="text-xs opacity-80 mt-0.5">{description}</p>}
      </div>
      {action && <div className="shrink-0 text-xs">{action}</div>}
    </div>
  );
}
