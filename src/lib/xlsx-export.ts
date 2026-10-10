import * as XLSX from "xlsx";
import { neutralizeSpreadsheetCell } from "@/lib/spreadsheet";

/**
 * Minimal, safe workbook builder for server-side Excel exports.
 *
 * Reuses the already-present `xlsx` dependency (read-only elsewhere) and the
 * shared CSV/formula-injection neutraliser. Every cell is passed through
 * `neutralizeSpreadsheetCell` so text starting with =, +, -, @ (or control
 * chars) cannot become a formula.
 *
 * Returns a Node Buffer ready to serve as an attachment.
 */

export interface SheetSpec {
  name: string;
  /** Header row (already Indonesian, human-readable). */
  headers: string[];
  /** Data rows — each cell is neutralised + typed. */
  rows: (string | number | null | undefined)[][];
}

export function buildXlsxBuffer(sheets: SheetSpec[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const aoa: (string | number)[][] = [
      sheet.headers.map((h) => neutralizeSpreadsheetCell(h)),
      ...sheet.rows.map((row) => row.map((c) => neutralizeSpreadsheetCell(c))),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Reasonable default column widths so the file opens legibly.
    const colCount = sheet.headers.length;
    ws["!cols"] = Array.from({ length: colCount }, (_, i) => {
      const header = sheet.headers[i] ?? "";
      return { wch: Math.max(10, Math.min(42, header.length + 4)) };
    });
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return out as Buffer;
}
