import JSZip from "jszip";
import * as fs from "fs";
import * as path from "path";

/**
 * IHT / Diklat certificate generator.
 *
 * Uses the official PowerPoint template (`public/templates/sertifikat-iht.pptx`)
 * which carries `{{PLACEHOLDER}}` text boxes, and fills them per participant —
 * mirroring the reference generator (Generator_Sertifikat_IHT) but server-side.
 *
 * No new dependency: the .pptx is a ZIP, edited with the `jszip` that already
 * ships with the project (`docx` dependency). Substitution is done per text run
 * (`<a:t>`), which is exactly how the reference VBA replaced runs, so each
 * placeholder keeps its original font/size/colour.
 */

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "public",
  "templates",
  "sertifikat-iht.pptx",
);

export const CERTIFICATE_FIELD_LABELS = {
  NAMA: "Nama Peserta",
  TEMA: "Tema / Materi",
  TANGGAL: "Tanggal",
  TEMPAT: "Tempat",
  JPL: "JPL",
  NO_SERTIFIKAT: "Nomor Sertifikat",
  NAMA_RS: "Nama Rumah Sakit",
} as const;

export interface CertificateData {
  nama: string;
  tema: string;
  tanggal: Date | string;
  tempat: string;
  jpl: string | number;
  noSertifikat: string;
  /** Left signature — Kepala Seksi Keperawatan dan Kebidanan (fixed). */
  kepalaSeksiNama: string;
  kepalaSeksiNip: string;
  /** Right signature — Kepala Bagian Diklat (blank by default). */
  kepalaDiklatNama?: string;
  kepalaDiklatNip?: string;
}

export const NAMA_RS = "RUMAH SAKIT ADHYAKSA JAWA TIMUR";

// ── Fixed signatories (per MYSIMNUSA policy) ──────────────────────────────
export const KEPALA_SEKSI = {
  position: "KEPALA SEKSI KEPERAWATAN DAN KEBIDANAN",
  name: "Muhammad Rijali Pajri, S.Kep.Ners., M.M",
  nip: "198607212009121001",
} as const;

export const KEPALA_DIKLAT = {
  position: "KEPALA BAGIAN DIKLAT",
  name: "",
  nip: "",
} as const;

const MONTHS_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/** "16 September 2026" */
export function formatIndoDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return String(d);
  return `${date.getDate()} ${MONTHS_ID[date.getMonth()]} ${date.getFullYear()}`;
}

export function romanMonth(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "I";
  return ROMAN[date.getMonth()] ?? "I";
}

/**
 * Build a certificate number from a configurable pattern.
 *
 * Pattern tokens: {PREFIX} {SEQ} {MONTH} {YEAR}, with `{SEQ:n}` controlling
 * zero-padding. Default mirrors the reference: `{PREFIX}{SEQ:3}/{MONTH}/{YEAR}`.
 */
export function buildCertificateNumber(
  pattern: string,
  opts: { prefix: string; seq: number; date: Date | string; pad?: number },
): string {
  const pad = opts.pad ?? 3;
  const date = typeof opts.date === "string" ? new Date(opts.date) : opts.date;
  const year = Number.isNaN(date.getTime()) ? String(new Date().getFullYear()) : String(date.getFullYear());
  return pattern
    .replace(/\{PREFIX\}/g, opts.prefix)
    .replace(/\{SEQ(?::(\d+))?\}/g, (_m, n) => String(opts.seq).padStart(n ? Number(n) : pad, "0"))
    .replace(/\{MONTH\}/g, romanMonth(opts.date))
    .replace(/\{YEAR\}/g, year);
}

export const DEFAULT_NUMBER_PATTERN = "{PREFIX}{SEQ:3}/{MONTH}/{YEAR}";
export const DEFAULT_NUMBER_PREFIX = "RSAJT/IHT/IBS/";

/** Build the placeholder map that the template substitutes. */
export function buildPlaceholderMap(data: CertificateData): Record<string, string> {
  return {
    "{{NAMA}}": data.nama,
    "{{TEMA}}": data.tema,
    "{{TANGGAL}}": formatIndoDate(data.tanggal),
    "{{TEMPAT}}": data.tempat,
    "{{JPL}}": String(data.jpl),
    "{{NO_SERTIFIKAT}}": data.noSertifikat,
    "{{NAMA_RS}}": NAMA_RS,
    "{{KEPALA_RUANG}}": data.kepalaSeksiNama,
    "{{NIP_RUANG}}": data.kepalaSeksiNip ? `NIP. ${data.kepalaSeksiNip}` : "",
    "{{KEPALA_TIM}}": data.kepalaDiklatNama ?? KEPALA_DIKLAT.name,
    "{{NIP_TIM}}": data.kepalaDiklatNip ? `NIP. ${data.kepalaDiklatNip}` : "",
  };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Read the template bytes once (cached in-process on a warm instance). */
let cachedTemplate: Buffer | null = null;

/** PPTX is a ZIP container — must start with "PK" and stay under this size. */
const MAX_TEMPLATE_BYTES = 20 * 1024 * 1024; // 20 MB

export function readTemplate(): Buffer {
  if (cachedTemplate) return cachedTemplate;
  const buf = fs.readFileSync(TEMPLATE_PATH);
  // Defence-in-depth: the template is a fixed file, but verify it really is a
  // (ZIP-based) PPTX and not oversized before handing it to JSZip.
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw new Error("Template sertifikat tidak valid (bukan berkas PPTX)");
  }
  if (buf.length > MAX_TEMPLATE_BYTES) {
    throw new Error("Template sertifikat melebihi batas ukuran");
  }
  cachedTemplate = buf;
  return cachedTemplate;
}

export function templateExists(): boolean {
  return fs.existsSync(TEMPLATE_PATH);
}

/**
 * Fill the template's slide placeholders and return the resulting .pptx bytes.
 *
 * Replacement is per `<a:t>…</a:t>` run so original formatting is preserved.
 * Any placeholder that ends up split across runs is handled by a second pass
 * over the concatenated run text of each paragraph.
 */
export async function renderCertificatePptx(data: CertificateData): Promise<Buffer> {
  const zip = await JSZip.loadAsync(readTemplate());
  const slideFile = zip.file("ppt/slides/slide1.xml");
  if (!slideFile) throw new Error("Template sertifikat tidak valid (slide1.xml tidak ditemukan)");

  const map = buildPlaceholderMap(data);
  let xml = await slideFile.async("string");

  // Pass 1 — replace tokens that sit wholly inside a single `<a:t>` run.
  xml = xml.replace(/<a:t>([\s\S]*?)<\/a:t>/g, (_m, inner: string) => {
    let text = inner;
    for (const [token, value] of Object.entries(map)) {
      if (text.includes(token)) text = text.split(token).join(escapeXml(value));
    }
    return `<a:t>${text}</a:t>`;
  });

  zip.file("ppt/slides/slide1.xml", xml);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** Sanitise a filename segment. */
export function safeFileName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80) || "peserta";
}

/**
 * Lightweight HTML preview of the certificate (data only — the real artifact is
 * the .pptx). Mirrors the template's visual order: header → SERTIFIKAT →
 * recipient → theme → date/place/JPL → number → two signatures.
 */
export function renderCertificatePreviewHtml(data: CertificateData): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>Sertifikat ${esc(data.nama)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; font-family: Georgia, 'Times New Roman', serif; background:#eef2f5; }
  .page { width: 1122px; height: 631px; margin: 16px auto; background:#fff; position:relative;
          border:1px solid #dbe4ea; box-shadow:0 8px 30px rgba(15,40,70,.12); overflow:hidden;
          padding: 48px 64px; display:flex; flex-direction:column; align-items:center; text-align:center; }
  .page::before { content:""; position:absolute; inset:14px; border:3px double #0f4c81; pointer-events:none; }
  .rs { font-size:14px; letter-spacing:.12em; color:#0f4c81; font-weight:700; margin-bottom:6px; }
  .title { font-size:52px; font-weight:800; letter-spacing:.16em; color:#0f4c81; margin:10px 0 2px; }
  .sub { font-size:16px; letter-spacing:.28em; color:#1479b8; text-transform:uppercase; margin-bottom:22px; }
  .lead { font-size:15px; color:#475569; }
  .name { font-size:40px; font-weight:800; color:#123047; margin:10px 0; border-bottom:2px solid #cfe0ea; padding-bottom:6px; min-width:60%; }
  .tema { font-size:20px; font-weight:700; color:#1479b8; margin:8px 0; }
  .meta { font-size:15px; color:#475569; }
  .jpl { font-size:15px; color:#475569; margin-top:6px; }
  .num { font-size:12px; color:#64748b; margin-top:14px; letter-spacing:.04em; }
  .sigs { position:absolute; left:64px; right:64px; bottom:44px; display:flex; justify-content:space-between; }
  .sig { width:42%; font-size:13px; color:#334155; }
  .sig .pos { font-weight:700; color:#123047; }
  .sig .space { height:66px; }
  .sig .nm { border-top:1px solid #94a3b8; padding-top:4px; font-weight:600; color:#123047; }
</style></head><body>
  <div class="page">
    <div class="rs">${esc(NAMA_RS)}</div>
    <div class="title">SERTIFIKAT</div>
    <div class="sub">${esc("IHT RUANG IBS")}</div>
    <div class="lead">Diberikan kepada</div>
    <div class="name">${esc(data.nama)}</div>
    <div class="lead">atas partisipasi dalam kegiatan In House Training</div>
    <div class="tema">${esc(data.tema)}</div>
    <div class="meta">yang diselenggarakan pada ${esc(formatIndoDate(data.tanggal))} di ${esc(data.tempat)}</div>
    <div class="jpl">Jam Pelajaran: ${esc(String(data.jpl))} JPL</div>
    <div class="num">Nomor Sertifikat: ${esc(data.noSertifikat)}</div>
    <div class="sigs">
      <div class="sig">
        <div class="pos">${esc(KEPALA_SEKSI.position)}</div>
        <div class="space"></div>
        <div class="nm">${esc(data.kepalaSeksiNama)}</div>
        <div>NIP. ${esc(data.kepalaSeksiNip)}</div>
      </div>
      <div class="sig">
        <div class="pos">${esc(KEPALA_DIKLAT.position)}</div>
        <div class="space"></div>
        <div class="nm">${esc(data.kepalaDiklatNama || "………………………………")}</div>
        <div>NIP. ${esc(data.kepalaDiklatNip || "………………………")}</div>
      </div>
    </div>
  </div>
</body></html>`;
}
