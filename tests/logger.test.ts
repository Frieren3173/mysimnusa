import { describe, it, expect } from "vitest";
import { safeErrorMessage } from "@/lib/logger";

describe("safeErrorMessage", () => {
  it("returns a generic Indonesian message per known code", () => {
    expect(safeErrorMessage("UPLOAD_FAILED")).toBe("Gagal mengunggah berkas");
    expect(safeErrorMessage("STORAGE_ERROR")).toBe("Gagal membaca penyimpanan berkas");
    expect(safeErrorMessage("IMPORT_FAILED")).toBe("Gagal mengimpor data");
  });

  it("falls back to a generic server message for unknown codes", () => {
    expect(safeErrorMessage("SOMETHING_NEW")).toBe("Terjadi kesalahan pada server");
  });

  it("never echoes anything resembling an exception message", () => {
    // The helper takes only a code, so no raw message can leak by construction.
    const msg = safeErrorMessage("IMPORT_FAILED");
    expect(msg).not.toMatch(/Error|at |postgres|token|http/i);
  });
});
