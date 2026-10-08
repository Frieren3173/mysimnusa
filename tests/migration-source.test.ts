import { describe, it, expect } from "vitest";
import { driveDownloadUrl, extractSheetIdFromUrl } from "@/lib/migration/source";

describe("extractSheetIdFromUrl (Google host allow-list)", () => {  it("extracts the ID from an allowed Google Sheets URL", () => {
    expect(
      extractSheetIdFromUrl("https://docs.google.com/spreadsheets/d/1AbC_def-123/edit#gid=0"),
    ).toBe("1AbC_def-123");
    expect(
      extractSheetIdFromUrl("https://drive.google.com/spreadsheets/d/ZZZ999/edit"),
    ).toBe("ZZZ999");
  });

  it("accepts a bare spreadsheet ID", () => {
    expect(extractSheetIdFromUrl("1AbCdefGhIJKlmnoPQRstu")).toBe("1AbCdefGhIJKlmnoPQRstu");
  });

  it("rejects URLs on non-Google hosts (SSRF guard)", () => {
    expect(extractSheetIdFromUrl("https://evil.example.com/spreadsheets/d/1AbC_def/edit")).toBeNull();
    expect(extractSheetIdFromUrl("http://169.254.169.254/spreadsheets/d/abc")).toBeNull();
    expect(extractSheetIdFromUrl("https://docs.google.com.evil.com/spreadsheets/d/abc")).toBeNull();
  });

  it("rejects non-URL junk", () => {
    expect(extractSheetIdFromUrl("not a url")).toBeNull();
    expect(extractSheetIdFromUrl("")).toBeNull();
    expect(extractSheetIdFromUrl("https://docs.google.com/document/d/abc/edit")).toBeNull();
  });
});

describe("driveDownloadUrl", () => {
  it("exports native Google Docs files", () => {
    expect(driveDownloadUrl("file-id", "application/vnd.google-apps.document")).toBe(
      "https://www.googleapis.com/drive/v3/files/file-id/export?mimeType=application%2Fpdf",
    );
  });

  it("downloads uploaded binaries directly, even without a known MIME type", () => {
    expect(
      driveDownloadUrl(
        "file-id",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe("https://www.googleapis.com/drive/v3/files/file-id?alt=media&supportsAllDrives=true");
    expect(driveDownloadUrl("file-id")).toBe(
      "https://www.googleapis.com/drive/v3/files/file-id?alt=media&supportsAllDrives=true",
    );
  });
});
