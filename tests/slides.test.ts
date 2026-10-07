import { describe, it, expect } from "vitest";
import { isSafeSlideName, resolveSlidePath } from "@/lib/slides";

describe("isSafeSlideName", () => {
  it("accepts ordinary slide filenames", () => {
    expect(isSafeSlideName("1699999999_0.jpg")).toBe(true);
    expect(isSafeSlideName("foto.png")).toBe(true);
    expect(isSafeSlideName("a-b_c.webp")).toBe(true);
    expect(isSafeSlideName("x.jpeg")).toBe(true);
  });

  it("rejects path traversal", () => {
    expect(isSafeSlideName("../secret.jpg")).toBe(false);
    expect(isSafeSlideName("..%2fsecret.jpg")).toBe(false);
    expect(isSafeSlideName("a/../../b.jpg")).toBe(false);
    expect(isSafeSlideName("sub/dir.jpg")).toBe(false);
    expect(isSafeSlideName("a\\b.jpg")).toBe(false);
  });

  it("rejects null bytes, absolute paths and dotfiles", () => {
    expect(isSafeSlideName("bad\u0000.jpg")).toBe(false);
    expect(isSafeSlideName("/etc/passwd.jpg")).toBe(false);
    expect(isSafeSlideName(".hidden.jpg")).toBe(false);
    expect(isSafeSlideName(".env")).toBe(false);
  });

  it("rejects disallowed extensions", () => {
    expect(isSafeSlideName("shell.php")).toBe(false);
    expect(isSafeSlideName("script.js")).toBe(false);
    expect(isSafeSlideName("noext")).toBe(false);
    expect(isSafeSlideName("image.jpg.exe")).toBe(false);
  });

  it("rejects empty and overlong names", () => {
    expect(isSafeSlideName("")).toBe(false);
    expect(isSafeSlideName("a".repeat(300) + ".jpg")).toBe(false);
  });
});

describe("resolveSlidePath", () => {
  it("returns an absolute path inside the slides directory for safe names", () => {
    const p = resolveSlidePath("ok.jpg");
    expect(p).not.toBeNull();
    expect(p!.endsWith("ok.jpg")).toBe(true);
  });

  it("returns null for traversal attempts", () => {
    expect(resolveSlidePath("../x.jpg")).toBeNull();
    expect(resolveSlidePath("..\\x.jpg")).toBeNull();
    expect(resolveSlidePath("a/b.jpg")).toBeNull();
  });
});
