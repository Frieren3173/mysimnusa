import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ─── Data ───────────────────────────────────────────────────

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

export const CHART_PALETTE = [
  "#2563eb",
  "#8b5cf6",
  "#f59e0b",
  "#22c55e",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#64748b",
];

export function formatPct(value: number, total: number): string {
  if (total <= 0) return "0%";
  const pct = (value / total) * 100;
  return `${Math.round(pct * 10) / 10}%`;
}

// ─── Chart Shell ────────────────────────────────────────────

export function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="px-5 py-4">
        <h3 className="text-[13px] font-bold uppercase tracking-wide text-slate-700 mb-3">
          {title}
        </h3>
        {children}
      </CardContent>
    </Card>
  );
}

// ─── Bar Chart (native, no deps) ────────────────────────────

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
  if (data.length === 0) {
    return <p className="text-xs text-slate-400 py-8 text-center">Belum ada data</p>;
  }

  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const sum = total ?? data.reduce((acc, d) => acc + d.value, 0);
  const step = max / Y_TICKS;

  return (
    <div>
      <div className="flex gap-2">
        {/* Y axis */}
        <div className="w-7 h-44 flex flex-col justify-between items-end text-[10px] text-slate-400">
          {Array.from({ length: Y_TICKS + 1 }).map((_, i) => (
            <span key={i} className="leading-none">
              {step * (Y_TICKS - i)}
            </span>
          ))}
        </div>

        {/* Plot */}
        <div className="flex-1 min-w-0">
          <div className="relative h-44 border-b border-l border-slate-200">
            {Array.from({ length: Y_TICKS - 1 }).map((_, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 border-t border-slate-100"
                style={{ top: `${((i + 1) / Y_TICKS) * 100}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-end gap-1.5 px-1.5">
              {data.map((d, i) => (
                <div
                  key={d.label}
                  className="flex-1 min-w-0 h-full flex flex-col justify-end items-center"
                >
                  <span className="text-[9px] font-medium text-slate-500 mb-0.5 leading-none">
                    {d.value}
                  </span>
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${Math.max((d.value / max) * 100, 2)}%`,
                      backgroundColor: d.color ?? CHART_PALETTE[i % CHART_PALETTE.length],
                    }}
                    title={`${d.label}: ${d.value} (${formatPct(d.value, sum)})`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* X labels */}
          <div className={cn("flex gap-1.5 px-1.5", rotateLabels ? "h-20" : "h-8 pt-1")}>
            {data.map((d) => (
              <div
                key={d.label}
                className={cn(
                  "flex-1 min-w-0 flex",
                  rotateLabels ? "items-end" : "items-start"
                )}
              >
                <span
                  className={cn(
                    "text-[9px] text-slate-500 leading-tight",
                    rotateLabels
                      ? "inline-block whitespace-nowrap origin-bottom-left -rotate-45"
                      : "w-full truncate text-center"
                  )}
                  title={d.label}
                >
                  {d.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {data.map((d, i) => (
          <span key={d.label} className="inline-flex items-center gap-1.5 text-[10px] text-slate-600">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: d.color ?? CHART_PALETTE[i % CHART_PALETTE.length] }}
            />
            {d.label}: {d.value} ({formatPct(d.value, sum)})
          </span>
        ))}
      </div>
    </div>
  );
}
