import { describe, it, expect } from "vitest";
import {
  validateUpload,
  matchesMagicBytes,
  contentTypeForName,
  isInlineSafe,
  contentDisposition,
  EXT_MIME,
} from "@/lib/file-type";

const ALLOWED = Object.keys(EXT_MIME);

function bytes(...parts: (number[] | string)[]): Uint8Array {
  const out: number[] = [];
  for (const p of parts) {
    if (typeof p === "string") out.push(...[...p].map((c) => c.charCodeAt(0)));
    else out.push(...p);
  }
  return new Uint8Array(out);
}

const PDF = bytes("%PDF-1.7\n%âãÏÓ\n");
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], "JFIF");
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = bytes("RIFF", [0, 0, 0, 0], "WEBP");
const OLE = bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP = bytes("PK", [0x03, 0x04]);
const HTML = bytes("<html><body>hi</body></html>");

describe("validateUpload", () => {
  it("accepts a real PDF", () => {
    const r = validateUpload("scan.pdf", "application/pdf", PDF, ALLOWED);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mime).toBe("application/pdf");
  });

  it("rejects an HTML file named .pdf (magic bytes)", () => {
    const r = validateUpload("evil.pdf", "application/pdf", HTML, ALLOWED);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_CONTENT");
  });

  it("rejects when client MIME contradicts the extension", () => {
    const r = validateUpload("photo.png", "application/pdf", PNG, ALLOWED);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MIME_MISMATCH");
  });

  it("ignores a generic application/octet-stream client type", () => {
    const r = validateUpload("photo.png", "application/octet-stream", PNG, ALLOWED);
    expect(r.ok).toBe(true);
  });

  it("rejects an unsupported extension", () => {
    const r = validateUpload("script.exe", "application/octet-stream", ZIP, ALLOWED);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_TYPE");
  });

  it("accepts docx / xlsx (ZIP container)", () => {
    expect(validateUpload("a.docx", "", ZIP, ALLOWED).ok).toBe(true);
    expect(validateUpload("a.xlsx", "", ZIP, ALLOWED).ok).toBe(true);
  });

  it("accepts doc / xls (OLE container)", () => {
    expect(validateUpload("a.doc", "", OLE, ALLOWED).ok).toBe(true);
    expect(validateUpload("a.xls", "", OLE, ALLOWED).ok).toBe(true);
  });

  it("accepts jpeg / png / webp images", () => {
    expect(validateUpload("a.jpg", "image/jpeg", JPEG, ALLOWED).ok).toBe(true);
    expect(validateUpload("a.png", "image/png", PNG, ALLOWED).ok).toBe(true);
    expect(validateUpload("a.webp", "image/webp", WEBP, ALLOWED).ok).toBe(true);
  });
});

describe("matchesMagicBytes", () => {
  it("matches known signatures", () => {
    expect(matchesMagicBytes("application/pdf", PDF)).toBe(true);
    expect(matchesMagicBytes("image/jpeg", JPEG)).toBe(true);
    expect(matchesMagicBytes("image/png", PNG)).toBe(true);
    expect(matchesMagicBytes("image/webp", WEBP)).toBe(true);
  });

  it("does not match HTML against PDF", () => {
    expect(matchesMagicBytes("application/pdf", HTML)).toBe(false);
  });
});

describe("content type helpers", () => {
  it("derives Content-Type from the file name extension", () => {
    expect(contentTypeForName("staff/1/str/abc.pdf")).toBe("application/pdf");
    expect(contentTypeForName("x.JPG")).toBe("image/jpeg");
    expect(contentTypeForName("unknown.bin")).toBe("application/octet-stream");
  });

  it("only marks PDF and images as inline-safe", () => {
    expect(isInlineSafe("application/pdf")).toBe(true);
    expect(isInlineSafe("image/png")).toBe(true);
    expect(isInlineSafe("application/msword")).toBe(false);
    expect(
      isInlineSafe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(false);
  });
});

describe("contentDisposition", () => {
  it("emits a simple ASCII filename for plain names", () => {
    const v = contentDisposition("attachment", "laporan.pdf");
    expect(v).toBe('attachment; filename="laporan.pdf"');
  });

  it("adds RFC 5987 filename* for non-ASCII names", () => {
    const v = contentDisposition("inline", "sertifikat-ü.pdf");
    expect(v).toContain("filename*=UTF-8''");
    expect(v.startsWith("inline;")).toBe(true);
  });

  it("strips path separators and quotes", () => {
    const v = contentDisposition("attachment", "../../etc/passwd");
    expect(v).not.toContain("..");
    expect(v).not.toContain("/");
  });
});
