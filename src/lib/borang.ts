export type BorangAction = "SUBMIT" | "VERIFY" | "APPROVE" | "REJECT" | "ARCHIVE";

export const PATIENT_CODE_RE = /^(TN|NY|BY\.(TN|NY))\.[A-Z]{1,2}$/;

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function shuffle(list: string[]): string[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Kode pasien anonim sesuai ruangan: PONEK = Ny.X, Perinatologi = By.TN/Ny.X, umum = Tn.X/Ny.X. */
export function generatePatientCode(roomName: string | null, taken: Iterable<string>): string {
  const room = (roomName ?? "").toLowerCase();
  const prefixes =
    room.includes("perina") || room.includes("nicu")
      ? ["BY.TN", "BY.NY"]
      : room.includes("ponek")
        ? ["NY"]
        : ["TN", "NY"];
  const used = new Set(taken);
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const single = shuffle(ALPHA.split("")).find((l) => !used.has(`${prefix}.${l}`));
  if (single) return `${prefix}.${single}`;
  for (let i = 0; i < 500; i++) {
    const two = ALPHA[Math.floor(Math.random() * 26)] + ALPHA[Math.floor(Math.random() * 26)];
    if (!used.has(`${prefix}.${two}`)) return `${prefix}.${two}`;
  }
  return `${prefix}.${Date.now().toString(36).toUpperCase().slice(-2)}`;
}

/** No. rekam medis random 6 digit, unik terhadap `taken`. */
export function generateRmNumber(taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let i = 0; i < 100; i++) {
    const n = String(Math.floor(100000 + Math.random() * 900000));
    if (!used.has(n)) return n;
  }
  return String(Date.now()).slice(-6);
}

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
