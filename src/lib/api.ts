import { z } from "zod";

// ─── Standard API Response ─────────────────────────────────

export type ApiResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: ApiError };

export interface ApiError {
  code: string;
  message: string;
  fields?: Record<string, string[]>;
}

export function ok<T>(data: T): Response {
  return Response.json({ success: true, data } satisfies ApiResponse<T>);
}

export function err(
  code: string,
  message: string,
  status = 400,
  fields?: Record<string, string[]>
): Response {
  return Response.json(
    { success: false, error: { code, message, fields } } satisfies ApiResponse,
    { status }
  );
}

export function parseBody<T>(
  schema: z.ZodSchema<T>,
  body: unknown
): { data: T; error: null } | { data: null; error: Response } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const fields: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".");
      if (!fields[key]) fields[key] = [];
      fields[key].push(issue.message);
    }
    return {
      data: null,
      error: err("VALIDATION_ERROR", "Data tidak valid", 422, fields),
    };
  }
  return { data: result.data, error: null };
}

// ─── Pagination ──────────────────────────────────────────

export const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  perPage: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type PaginationParams = z.infer<typeof PaginationSchema>;

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

export function paginate<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResponse<T> {
  return {
    data,
    pagination: {
      page: params.page,
      perPage: params.perPage,
      total,
      totalPages: Math.ceil(total / params.perPage),
    },
  };
}

/**
 * Builds a case-insensitive `contains` filter for one or more fields.
 *
 * Postgres `contains` is case-sensitive by default, so every user-facing search
 * must pass `mode: "insensitive"` — otherwise searching "IBS" misses "ibs" and
 * the UI appears broken. Returning a plain object keeps the query fully
 * parameterised (no raw SQL / injection risk).
 */
export function searchFilter<T extends Record<string, unknown>>(
  search: string | null | undefined,
  fields: (keyof T | string)[],
): Record<string, unknown> | undefined {
  const q = (search ?? "").trim();
  if (!q) return undefined;
  return {
    OR: fields.map((field) => ({ [field as string]: { contains: q, mode: "insensitive" } })),
  };
}

/** Reads a trimmed query-parameter value from a URL. */
export function queryParam(url: URL, name: string): string {
  return url.searchParams.get(name)?.trim() ?? "";
}

