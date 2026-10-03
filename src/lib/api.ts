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
