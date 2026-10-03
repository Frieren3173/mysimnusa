export type BorangAction = "SUBMIT" | "VERIFY" | "APPROVE" | "REJECT" | "ARCHIVE";

export const BORANG_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draf",
  SUBMITTED: "Terkirim",
  VERIFICATION: "Verifikasi",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  ARCHIVED: "Diarsipkan",
};

export const BORANG_STATUS_VARIANT: Record<
  string,
  "default" | "draft" | "pending" | "info" | "active" | "rejected" | "archived"
> = {
  DRAFT: "draft",
  SUBMITTED: "pending",
  VERIFICATION: "info",
  APPROVED: "active",
  REJECTED: "rejected",
  ARCHIVED: "archived",
};

export const ACTION_LABEL: Record<BorangAction, string> = {
  SUBMIT: "Kirim",
  VERIFY: "Verifikasi",
  APPROVE: "Setujui",
  REJECT: "Tolak",
  ARCHIVE: "Arsipkan",
};
