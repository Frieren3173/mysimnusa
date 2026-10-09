import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * URL-driven pagination for Server Components.
 *
 * Renders prev/next + a compact page window as links that merge the current
 * query params, so search/filter state is preserved across pages. No client JS
 * is required, which keeps large list pages cheap to render.
 */
export function ServerPagination({
  basePath,
  params,
  page,
  perPage,
  total,
}: {
  basePath: string;
  /** Current query params (search, filters, type, …) — merged into links. */
  params: Record<string, string | undefined>;
  page: number;
  perPage: number;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (totalPages <= 1) {
    return (
      <p className="px-1 py-3 text-xs text-[var(--color-muted-foreground)]">
        {total} data
      </p>
    );
  }

  const buildHref = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") q.set(k, v);
    }
    if (p > 1) q.set("page", String(p));
    else q.delete("page");
    const qs = q.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const windowStart = Math.max(1, Math.min(page - 2, totalPages - 4));
  const windowEnd = Math.min(totalPages, windowStart + 4);
  const pages: number[] = [];
  for (let i = windowStart; i <= windowEnd; i++) pages.push(i);

  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3">
      <p className="text-xs text-[var(--color-muted-foreground)]">
        Menampilkan <span className="font-medium text-[var(--color-foreground)]">{start}–{end}</span>{" "}
        dari <span className="font-medium text-[var(--color-foreground)]">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <PageLink href={buildHref(1)} disabled={page === 1} label="Halaman pertama">«</PageLink>
        <PageLink href={buildHref(page - 1)} disabled={page === 1} label="Halaman sebelumnya">‹</PageLink>
        {pages.map((p) => (
          <PageLink key={p} href={buildHref(p)} active={p === page} label={`Halaman ${p}`}>
            {p}
          </PageLink>
        ))}
        <PageLink href={buildHref(page + 1)} disabled={page === totalPages} label="Halaman berikutnya">›</PageLink>
        <PageLink href={buildHref(totalPages)} disabled={page === totalPages} label="Halaman terakhir">»</PageLink>
      </div>
    </div>
  );
}

function PageLink({
  href,
  active,
  disabled,
  label,
  children,
}: {
  href: string;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const base =
    "grid h-7 min-w-[28px] place-items-center rounded-md px-2 text-xs font-medium transition-colors";
  if (disabled) {
    return (
      <span className={cn(base, "cursor-not-allowed text-[var(--color-muted-foreground)]/40")} aria-disabled="true">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        base,
        active
          ? "bg-[var(--color-primary)] text-white shadow-sm"
          : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-primary-subtle)] hover:text-[var(--color-primary)]",
      )}
    >
      {children}
    </Link>
  );
}
