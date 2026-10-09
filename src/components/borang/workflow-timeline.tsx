import { cn } from "@/lib/utils";
import { Check, Circle, Clock } from "lucide-react";

/**
 * Compact, dependency-free vertical workflow timeline for a Borang entry.
 *
 * Shows the canonical lifecycle (DRAFT → SUBMITTED → APPROVED_KARU →
 * READY_TO_PRINT → PRINTED → COMPLETED) and marks the current step. Legacy
 * statuses are mapped to the nearest step so old entries still render sanely.
 */

const STEPS: { key: string; label: string; legacy?: string[] }[] = [
  { key: "DRAFT", label: "Draf" },
  { key: "SUBMITTED", label: "Diajukan", legacy: ["VERIFICATION"] },
  { key: "APPROVED_KARU", label: "Disetujui Kepala Ruang", legacy: ["APPROVED"] },
  { key: "READY_TO_PRINT", label: "Siap Dicetak" },
  { key: "PRINTED", label: "Sudah Dicetak" },
  { key: "COMPLETED", label: "Selesai", legacy: ["ARCHIVED"] },
];

function stepIndex(status: string): number {
  // Special: revision is between submitted and approved → show as "needs revision".
  for (let i = 0; i < STEPS.length; i++) {
    if (STEPS[i].key === status) return i;
    if (STEPS[i].legacy?.includes(status)) return i;
  }
  return 0;
}

export function BorangWorkflowTimeline({ status }: { status: string }) {
  const isRevision = status === "REVISION_REQUIRED" || status === "REJECTED";
  // Revision sits at the "submitted" step but flagged.
  const current = isRevision ? 1 : stepIndex(status);

  return (
    <ol className="space-y-2" aria-label="Alur borang">
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={step.key} className="flex items-center gap-2.5 text-xs">
            <span
              className={cn(
                "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                done && "border-emerald-500 bg-emerald-500 text-white",
                active && !isRevision && "border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)]",
                active && isRevision && "border-red-400 bg-red-50 text-red-600",
                !done && !active && "border-[var(--color-border)] text-[var(--color-muted-foreground)]",
              )}
              aria-hidden="true"
            >
              {done ? <Check size={11} /> : active ? <Clock size={11} /> : <Circle size={9} />}
            </span>
            <span
              className={cn(
                done && "text-[var(--color-foreground)]",
                active && !isRevision && "font-medium text-[var(--color-primary)]",
                active && isRevision && "font-medium text-red-600",
                !done && !active && "text-[var(--color-muted-foreground)]",
              )}
            >
              {step.label}
              {active && isRevision && " · perlu revisi"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
