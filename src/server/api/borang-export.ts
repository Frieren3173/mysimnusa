import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  PageBreak,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  VerticalMergeType,
  WidthType,
} from "docx";
import { prisma } from "@/lib/prisma";
import { err } from "@/lib/api";
import { checkPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/constants";
import { formatDateShort } from "@/lib/utils";
import { contentDisposition } from "@/lib/file-type";
import {
  expandPatientRows,
  KASI_KEPERAWATAN,
  KEPALA_RUANGAN,
  PERAWAT_PEMOHON_POSITION,
} from "@/lib/borang";

const FONT = "Arial";
const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const noBorder = { style: BorderStyle.NONE, size: 0, color: "000000" };
const GRID = {
  top: border,
  bottom: border,
  left: border,
  right: border,
  insideHorizontal: border,
  insideVertical: border,
};
const FLAT = {
  top: noBorder,
  bottom: noBorder,
  left: noBorder,
  right: noBorder,
  insideHorizontal: noBorder,
  insideVertical: noBorder,
};

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGU", "SEP", "OKT", "NOV", "DES"];
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

type Align = (typeof AlignmentType)[keyof typeof AlignmentType];

function run(text: string, opts: { bold?: boolean; size?: number; underline?: boolean } = {}) {
  return new TextRun({
    text,
    font: FONT,
    size: opts.size ?? 18,
    bold: opts.bold ?? false,
    ...(opts.underline ? { underline: {} } : {}),
  });
}

function cell(lines: string[], opts: { width: number; columnSpan?: number; vMerge?: (typeof VerticalMergeType)[keyof typeof VerticalMergeType]; align?: Align; bold?: boolean; size?: number }) {
  return new TableCell({
    width: { size: opts.width, type: WidthType.PERCENTAGE },
    ...(opts.columnSpan ? { columnSpan: opts.columnSpan } : {}),
    ...(opts.vMerge ? { verticalMerge: opts.vMerge } : {}),
    verticalAlign: VerticalAlign.CENTER,
    children: (lines.length > 0 ? lines : [""]).map(
      (t) =>
        new Paragraph({
          alignment: opts.align ?? AlignmentType.LEFT,
          spacing: { before: 0, after: 0 },
          children: [run(t, { bold: opts.bold, size: opts.size })],
        })
    ),
  });
}

function kvTable(rows: [string, string][], labelWidth = 20) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: FLAT,
    rows: rows.map(
      ([k, v]) =>
        new TableRow({
          children: [
            cell([k], { width: labelWidth }),
            cell([`: ${v}`], { width: 100 - labelWidth }),
          ],
        })
    ),
  });
}

function spaced(height: number) {
  return new Paragraph({ spacing: { before: 0, after: height }, children: [] });
}

export async function GET(req: NextRequest) {
  const { authorized, user } = await checkPermission(PERMISSIONS.BORANG_LOGBOOK_READ);
  if (!user) return err("UNAUTHORIZED", "Silakan login terlebih dahulu", 401);
  if (!authorized) return err("FORBIDDEN", "Tidak memiliki akses", 403);

  const staffId = req.nextUrl.searchParams.get("staffId");
  const yearRaw = req.nextUrl.searchParams.get("year");
  if (!staffId) return err("BAD_REQUEST", "staffId wajib diisi", 400);
  if (!yearRaw || !/^\d{4}$/.test(yearRaw)) return err("BAD_REQUEST", "year harus YYYY", 400);
  const year = Number(yearRaw);

  const staff = await prisma.staff.findUnique({ where: { id: staffId } });
  if (!staff) return err("STAFF_NOT_FOUND", "Petugas tidak ditemukan", 404);

  const [entries, documents] = await Promise.all([
    prisma.borangEntry.findMany({
      where: { staffId, period: { startsWith: `${year}-` } },
      orderBy: [{ period: "asc" }, { createdAt: "asc" }],
      select: {
        period: true,
        patientIdentifier: true,
        rmNumber: true,
        actionType: true,
        quantity: true,
      },
    }),
    prisma.document.findMany({
      where: { staffId },
      include: { documentType: true },
    }),
  ]);

  const pickDoc = (code: string) =>
    documents
      .filter((d) => d.documentType.code === code)
      .sort((a, b) => (b.expiryDate?.getTime() ?? 0) - (a.expiryDate?.getTime() ?? 0))[0];
  const strDoc = pickDoc("STR");
  const sipDoc = pickDoc("SIP");
  const sipUntil = !sipDoc
    ? "—"
    : sipDoc.isLifetime
      ? "Seumur Hidup"
      : formatDateShort(sipDoc.expiryDate);

  // Rekap bulanan per tindakan
  const actionOrder: string[] = [];
  const counts = new Map<string, number[]>();
  for (const e of entries) {
    const m = Number(e.period.slice(5, 7)) - 1;
    if (m < 0 || m > 11) continue;
    let row = counts.get(e.actionType);
    if (!row) {
      row = Array(12).fill(0);
      counts.set(e.actionType, row);
      actionOrder.push(e.actionType);
    }
    row[m] += e.quantity;
  }

  const today = new Date();
  const dateLine = `Mojokerto, ${today.getDate()} ${MONTHS_ID[today.getMonth()]} ${today.getFullYear()}`;

  // ── Kop surat ───────────────────────────────────────────
  const kopPath = path.join(process.cwd(), "public", "kop.png");
  let kopChildren: Paragraph[];
  try {
    const data = fs.readFileSync(kopPath);
    kopChildren = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ type: "png", data, transformation: { width: 698, height: 122 } })],
      }),
    ];
  } catch {
    kopChildren = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [run("KEJAKSAAN REPUBLIK INDONESIA", { bold: true, size: 26 })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [run("RUMAH SAKIT ADHYAKSA JAWA TIMUR", { bold: true, size: 24 })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          run("Jl. Jatirejo - Jabung No.160, Kec. Jatirejo, Kab. Mojokerto, Jawa Timur"),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [run("Telp. (0321) 5211788 www.rsadhya​ksajatim.id")],
      }),
    ];
  }

  // ── Tabel rekap (halaman 1) ─────────────────────────────
  const monthWidths = Array(12).fill(6);
  const rekapHeaderTop = new TableRow({
    tableHeader: true,
    children: [
      cell(["NO"], {
        width: 4,
        bold: true,
        align: AlignmentType.CENTER,
        vMerge: VerticalMergeType.RESTART,
      }),
      cell(["NAMA KEGIATAN"], {
        width: 16,
        bold: true,
        align: AlignmentType.CENTER,
        vMerge: VerticalMergeType.RESTART,
      }),
      cell(["BULAN DAN JUMLAH"], {
        width: 80,
        columnSpan: 13,
        bold: true,
        align: AlignmentType.CENTER,
      }),
    ],
  });
  const rekapHeaderBottom = new TableRow({
    tableHeader: true,
    children: [
      cell([], { width: 4, vMerge: VerticalMergeType.CONTINUE }),
      cell([], { width: 16, vMerge: VerticalMergeType.CONTINUE }),
      ...MONTHS.map((m) => cell([m], { width: 6, bold: true, align: AlignmentType.CENTER })),
      cell(["TOTAL"], { width: 8, bold: true, align: AlignmentType.CENTER }),
    ],
  });

  const rekapBody =
    actionOrder.length === 0
      ? [
          new TableRow({
            children: [
              cell([`Belum ada data tindakan tahun ${year}`], {
                width: 100,
                columnSpan: 15,
                align: AlignmentType.CENTER,
              }),
            ],
          }),
        ]
      : actionOrder.map((action, i) => {
          const row = counts.get(action)!;
          const total = row.reduce((a, b) => a + b, 0);
          return new TableRow({
            children: [
              cell([String(i + 1)], { width: 4, align: AlignmentType.CENTER }),
              cell([action], { width: 16 }),
              ...row.map((n, mi) =>
                cell([n > 0 ? String(n) : ""], {
                  width: monthWidths[mi],
                  align: AlignmentType.CENTER,
                })
              ),
              cell([String(total)], { width: 8, align: AlignmentType.CENTER }),
            ],
          });
        });

  const rekapTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: GRID,
    rows: [rekapHeaderTop, rekapHeaderBottom, ...rekapBody],
  });

  // ── Tanda tangan (3 kolom: Kasi → Kepala Ruangan → Perawat) ──
  const sigGap = ["", "", "", "", ""];
  const sigTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: FLAT,
    rows: [
      new TableRow({
        children: [
          cell([dateLine], { width: 100, align: AlignmentType.RIGHT }),
        ],
      }),
      new TableRow({ children: [cell([""], { width: 100 })] }),
      new TableRow({
        children: [
          // 1. Kepala Seksi Keperawatan dan Kebidanan
          cell(
            [
              KASI_KEPERAWATAN.position,
              ...sigGap,
              KASI_KEPERAWATAN.name,
              `NIP. ${KASI_KEPERAWATAN.nip}`,
            ],
            { width: 33, align: AlignmentType.CENTER }
          ),
          // 2. Kepala Ruangan (blank — diisi manual)
          cell(
            [
              KEPALA_RUANGAN.position,
              ...sigGap,
              KEPALA_RUANGAN.name || "………………………………",
              KEPALA_RUANGAN.nip ? `NIP. ${KEPALA_RUANGAN.nip}` : "NIP. ………………………",
            ],
            { width: 34, align: AlignmentType.CENTER }
          ),
          // 3. Perawat yang meminta (dari data tenaga pembuat Borang)
          cell(
            [
              PERAWAT_PEMOHON_POSITION,
              ...sigGap,
              staff.name,
              `NIP. ${staff.nip ?? "………………………"}`,
            ],
            { width: 33, align: AlignmentType.CENTER }
          ),
        ],
      }),
    ],
  });

  // ── Tabel daftar pasien (halaman 2) ─────────────────────
  // Setiap entri dengan `quantity = N` dipecah menjadi N baris pasien
  // (inisial unik + No. RM unik) — dihitung, tidak disimpan.
  const patientRows = expandPatientRows(entries);

  const pasienHeader = new TableRow({
    tableHeader: true,
    children: [
      cell(["NO"], { width: 5, bold: true, align: AlignmentType.CENTER }),
      cell(["NAMA PASIEN"], { width: 18, bold: true, align: AlignmentType.CENTER }),
      cell(["NO. RM"], { width: 15, bold: true, align: AlignmentType.CENTER }),
      cell(["TINDAKAN"], { width: 52, bold: true, align: AlignmentType.CENTER }),
      cell(["JUMLAH"], { width: 10, bold: true, align: AlignmentType.CENTER }),
    ],
  });
  const pasienBody =
    patientRows.length === 0
      ? [
          new TableRow({
            children: [
              cell([`Belum ada data tindakan tahun ${year}`], {
                width: 100,
                columnSpan: 5,
                align: AlignmentType.CENTER,
              }),
            ],
          }),
        ]
      : patientRows.map((p, i) =>
          new TableRow({
            children: [
              cell([String(i + 1)], { width: 5, align: AlignmentType.CENTER }),
              cell([p.name], { width: 18, align: AlignmentType.CENTER }),
              cell([p.rmNumber], { width: 15, align: AlignmentType.CENTER }),
              cell([p.actionType], { width: 52 }),
              cell([String(p.quantity)], { width: 10, align: AlignmentType.CENTER }),
            ],
          })
        );
  const pasienTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: GRID,
    rows: [pasienHeader, ...pasienBody],
  });

  // ── Susun dokumen ───────────────────────────────────────
  const identity: [string, string][] = [
    ["Nama", staff.name],
    ["No. STR", strDoc?.number ?? "—"],
    ["No. SIP", sipDoc?.number ?? "—"],
    ["SIP berlaku sampai", sipUntil],
    ["Jabatan", staff.profession],
    ["Periode Kegiatan", `Januari - Desember ${year}`],
  ];

  const children: (Paragraph | Table)[] = [
    ...kopChildren,
    spaced(120),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 240 },
      children: [run("REKAPITULASI KEGIATAN PRAKTIK PROFESI", { size: 22 })],
    }),
    kvTable(identity),
    spaced(240),
    rekapTable,
    spaced(480),
    sigTable,
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 240 },
      children: [
        run("DAFTAR PASIEN DAN TINDAKAN YANG DILAKUKAN", { bold: true, size: 22 }),
      ],
    }),
    kvTable([
      ["Nama", staff.name],
      ["Periode Kegiatan", `Januari - Desember ${year}`],
    ]),
    spaced(240),
    pasienTable,
  ];

  const doc = new Document({
    creator: "MYSIMNUSA — Sistem Informasi Manajemen Keperawatan & Kebidanan",
    title: `Rekap Kegiatan Praktik Profesi ${staff.name} ${year}`,
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 720, right: 709, bottom: 720, left: 709 },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const safeName =
    staff.name
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, "")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_") || "Tenaga";
  const filename = `Rekap-Praktik-Profesi-${safeName}-${year}.docx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": contentDisposition("attachment", filename),
      "X-Content-Type-Options": "nosniff",
      "Content-Length": String(buffer.byteLength),
    },
  });
}
