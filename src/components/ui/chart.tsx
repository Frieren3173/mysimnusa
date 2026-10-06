"use client";

import * as React from "react";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ─── Data ───────────────────────────────────────────────────

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

/**
 * Ocean-blue coherent palette. Most bars are shades of the brand blue; a few
 * accent hues (aqua / amber / red) are reserved for *semantic* categories
 * (ownership, expiring, expired). No green/cyan/purple decoration palette.
 */
export const CHART_PALETTE = [
  "#1479b8", // ocean blue (brand)
  "#1e88c8", // sea blue
  "#4aa3d6", // lighter sea
  "#7fc0e0", // aqua
  "#0f4c81", // deep ocean
  "#2f6f9e", // muted steel blue
  "#9cc9e2", // pale aqua
  "#5b7c95", // cool slate blue
];

export function formatPct(value: number, total: number): string {
  if (total <= 0) return "0%";
  const pct = (value / total) * 100;
  return `${Math.round(pct * 10) / 10}%`;
}

// ─── Chart Shell ────────────────────────────────────────────

export function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="group transition-[transform,box-shadow,border-color] duration-200 ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:border-[var(--color-primary)]/30 hover:shadow-[0_8px_20px_-10px_rgba(15,40,70,0.22)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <CardContent className="px-5 py-4">
        <h3 className="mb-4 text-sm font-semibold tracking-[-0.01em] text-[var(--color-foreground)]">
          {title}
        </h3>
        {children}
      </CardContent>
    </Card>
  );
}

// ─── Bar Chart (native, interactive, no deps) ───────────────

const Y_TICKS = 4;

function niceMax(max: number): number {
  if (max <= 0) return 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const normalized = max / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 4 ? 4 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

export function BarChart({
  data,
  rotateLabels = false,
  total,
}: {
  data: BarDatum[];
  rotateLabels?: boolean;
  total?: number;
}) {
  const [active, setActive] = React.useState<number | null>(null);

  // Entrance: bars grow from 0 → value once, per chart mount.
  const [entered, setEntered] = React.useState(false);
  React.useEffect(() => {
    const t = window.setTimeout(() => setEntered(true), 30);
    return () => window.clearTimeout(t);
  }, []);

  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-xs text-[var(--color-muted-foreground)]">
        Belum ada data
      </p>
    );
  }

  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const sum = total ?? data.reduce((acc, d) => acc + d.value, 0);
  const step = max / Y_TICKS;
  const color = (d: BarDatum, i: number) => d.color ?? CHART_PALETTE[i % CHART_PALETTE.length];

  return (
    <div className="w-full">
      <div className="flex gap-2">
        {/* Y axis */}
        <div className="flex h-44 w-8 shrink-0 flex-col justify-between items-end text-[10px] tabular-nums text-[var(--color-muted-foreground)]">
          {Array.from({ length: Y_TICKS + 1 }).map((_, i) => (
            <span key={i} className="leading-none">
              {step * (Y_TICKS - i)}
            </span>
          ))}
        </div>

        {/* Plot */}
        <div className="min-w-0 flex-1">
          <div className="relative h-44 border-b border-l border-[var(--color-border)]">
            {Array.from({ length: Y_TICKS - 1 }).map((_, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 border-t border-[var(--color-border)]/60"
                style={{ top: `${((i + 1) / Y_TICKS) * 100}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-end gap-1.5 px-1.5">
              {data.map((d, i) => {
                const h = Math.max((d.value / max) * 100, 2);
                const isActive = active === i;
                return (
                  <div
                    key={`${d.label}-${i}`}
                    className="group/bar relative flex h-full min-w-0 flex-1 flex-col justify-end items-center"
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive((cur) => (cur === i ? null : cur))}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive((cur) => (cur === i ? null : cur))}
                    tabIndex={0}
                    role="img"
                    aria-label={`${d.label}: ${d.value} tenaga (${formatPct(d.value, sum)})`}
                  >
                    <span
                      className={cn(
                        "mb-0.5 text-[9px] font-medium leading-none tabular-nums transition-opacity duration-150",
                        isActive ? "text-[var(--color-foreground)]" : "text-[var(--color-muted-foreground)]",
                        active !== null && !isActive && "opacity-40",
                      )}
                    >
                      {d.value}
                    </span>
                    <div
                      className={cn(
                        "w-full origin-bottom rounded-t transition-[height,opacity,filter,transform] duration-[600ms] ease-[var(--ease-out-quint)] motion-reduce:transition-none",
                        active !== null && !isActive && "opacity-45",
                      )}
                      style={{
                        height: entered ? `${h}%` : "0%",
                        transitionDelay: entered ? `${i * 40}ms` : "0ms",
                        backgroundColor: color(d, i),
                        // Hover emphasis: subtle scale from the baseline, keeps origin.
                        transform: isActive ? "scaleY(1.03)" : "scaleY(1)",
                        filter: isActive ? "brightness(1.08) saturate(1.1)" : "none",
                        boxShadow: isActive ? "0 4px 10px -4px rgba(15,40,70,0.35)" : "none",
                      }}
                    />
                  </div>
                );
              })}

              {/* Tooltip — anchored near the active bar and clamped so it never
                  leaves the plot area (so a tall bar's tooltip can't escape the
                  card or slide under the sticky header). Plot height = 176px. */}
              {active !== null && (
                <div
                  className="pointer-events-none absolute z-20 w-max max-w-[180px] -translate-x-1/2 transition-opacity duration-150"
                  style={{
                    left: `clamp(52px, ${((active + 0.5) / data.length) * 100}%, calc(100% - 52px))`,
                    top: `clamp(0px, calc(176px - ${Math.max(
                      (data[active].value / max) * 100,
                      2,
                    )}% - 46px), 130px)`,
                  }}
                >
                  <div className="rounded-lg bg-[var(--color-foreground)] px-2.5 py-1.5 text-[10px] leading-tight text-white shadow-lg">
                    <p className="truncate font-semibold">{data[active].label}</p>
                    <p className="tabular-nums text-white/85">
                      {data[active].value} tenaga · {formatPct(data[active].value, sum)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* X labels */}
          <div className={cn("flex gap-1.5 px-1.5", rotateLabels ? "min-h-[64px] pt-1.5" : "pt-1.5")}>
            {data.map((d, i) => (
              <div
                key={`${d.label}-${i}`}
                className={cn(
                  "flex min-w-0 flex-1",
                  rotateLabels ? "items-start justify-end" : "items-start justify-center",
                  active !== null && active !== i && "opacity-45",
                )}
              >
                {rotateLabels ? (
                  <span
                    className="inline-block whitespace-nowrap text-[10px] leading-tight text-[var(--color-muted-foreground)]"
                    style={{ transform: "rotate(-40deg)", transformOrigin: "right top" }}
                    title={d.label}
                  >
                    {d.label}
                  </span>
                ) : (
                  <span
                    className="w-full [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden text-center text-[10px] leading-tight text-[var(--color-muted-foreground)]"
                    title={d.label}
                  >
                    {d.label}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend (wraps within the card; never overflows) */}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-[var(--color-border)]/70 pt-3">
        {data.map((d, i) => (
          <span
            key={`${d.label}-${i}`}
            className={cn(
              "inline-flex min-w-0 items-center gap-1.5 text-[10px] text-[var(--color-foreground)]/80 transition-opacity duration-150",
              active !== null && active !== i && "opacity-45",
            )}
          >
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: color(d, i) }}
            />
            <span className="truncate">
              {d.label}: {d.value} ({formatPct(d.value, sum)})
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Horizontal bar chart — for categories whose labels are long or numerous
 * (e.g. room distribution, competency certificates). Labels sit in their own
 * column so they wrap/ellipsize cleanly and never collide or overflow the card.
 * Same interaction + entrance motion as the vertical BarChart.
 */
export function HorizontalBarChart({
  data,
  total,
  maxRows,
}: {
  data: BarDatum[];
  total?: number;
  maxRows?: number;
}) {
  const [active, setActive] = React.useState<number | null>(null);
  const [entered, setEntered] = React.useState(false);

  React.useEffect(() => {
    const t = window.setTimeout(() => setEntered(true), 30);
    return () => window.clearTimeout(t);
  }, []);

  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-xs text-[var(--color-muted-foreground)]">
        Belum ada data
      </p>
    );
  }

  const rows = typeof maxRows === "number" ? data.slice(0, maxRows) : data;
  const sum = total ?? data.reduce((acc, d) => acc + d.value, 0);
  const max = Math.max(...rows.map((d) => d.value), 1);
  const color = (d: BarDatum, i: number) => d.color ?? CHART_PALETTE[i % CHART_PALETTE.length];

  return (
    <div className="w-full space-y-2">
      {rows.map((d, i) => {
        const pct = Math.max((d.value / max) * 100, 1.5);
        const isActive = active === i;
        return (
          <div
            key={`${d.label}-${i}`}
            className="group flex min-w-0 items-center gap-2.5"
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive((cur) => (cur === i ? null : cur))}
            onFocus={() => setActive(i)}
            onBlur={() => setActive((cur) => (cur === i ? null : cur))}
            tabIndex={0}
            role="img"
            aria-label={`${d.label}: ${d.value} tenaga (${formatPct(d.value, sum)})`}
          >
            <span
              className={cn(
                "w-28 shrink-0 truncate text-[10px] leading-tight text-[var(--color-muted-foreground)] transition-colors",
                isActive && "text-[var(--color-foreground)]",
              )}
              title={d.label}
            >
              {d.label}
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="block h-3.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-sunken)]" />
              <span
                className={cn(
                  "absolute inset-y-0 left-0 origin-left rounded-full transition-[width,opacity,filter] duration-[600ms] ease-[var(--ease-out-quint)] motion-reduce:transition-none",
                  active !== null && !isActive && "opacity-45",
                )}
                style={{
                  width: entered ? `${pct}%` : "0%",
                  transitionDelay: entered ? `${i * 30}ms` : "0ms",
                  backgroundColor: color(d, i),
                  filter: isActive ? "brightness(1.08)" : "none",
                }}
              />
              {/* Tooltip — sits to the right of the bar, vertically centered on the
                  row, so it always stays inside the card (never clipped by the
                  sticky header or card edges). */}
              {isActive && (
                <span className="pointer-events-none absolute left-full top-1/2 z-30 ml-2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[var(--color-foreground)] px-2.5 py-1.5 text-[10px] leading-tight text-white shadow-lg">
                  <span className="block font-semibold">{d.label}</span>
                  <span className="block tabular-nums text-white/85">
                    {d.value} tenaga · {formatPct(d.value, sum)}
                  </span>
                </span>
              )}
            </span>
            <span
              className={cn(
                "w-8 shrink-0 text-right text-[10px] font-medium tabular-nums text-[var(--color-foreground)]/80 transition-opacity",
                active !== null && !isActive && "opacity-45",
              )}
            >
              {d.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
