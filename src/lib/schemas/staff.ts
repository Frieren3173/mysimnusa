import { z } from "zod";

const NullableStr = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v ? v : null));

export const EducationSchema = z.object({
  level: z.string().min(1).max(50),
  institution: z.string().min(1).max(200),
  major: NullableStr,
  graduationYear: z.coerce
    .number()
    .int()
    .min(1950)
    .max(2100)
    .optional()
    .nullable(),
});

export const StaffSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(200),
  nip: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((v) => (v ? v : null)),
  email: z
    .string()
    .trim()
    .email("Email tidak valid")
    .max(200)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  phone: NullableStr,
  address: NullableStr,
  dateOfBirth: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : null))
    .refine((d) => d === null || !isNaN(d.getTime()), "Tanggal lahir tidak valid"),
  profession: z.string().trim().min(1, "Profesi wajib diisi").max(100),
  roomId: z.string().optional().nullable(),
  employmentStatus: z.enum(["ACTIVE", "INACTIVE", "RESIGNED", "RETIRED"]).default("ACTIVE"),
  isActive: z.boolean().default(true),
  education: z.array(EducationSchema).optional(),
  competencies: z.array(z.string()).optional(),
});

export type StaffInput = z.infer<typeof StaffSchema>;
