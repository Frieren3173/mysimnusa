/**
 * Minimal Chrome DevTools Protocol driver for staging Browser UAT.
 *
 * Uses the built-in global `WebSocket` (Node 18+/22+) so NO new dependency is
 * installed. Chrome is launched separately with --remote-debugging-port.
 *
 * STAGING ONLY. No credentials are logged.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = process.env.CHROME_BIN ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number(process.env.CDP_PORT ?? 9222);
const BASE = process.env.FIX_BASE ?? "http://localhost:3230";

interface JsonRpc {
  id: number;
  result?: unknown;
  error?: { message: string };
}

export class Cdp {
  private ws!: WebSocket;
  private seq = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private events = new Map<string, ((params: unknown) => void)[]>();

  static async launch(): Promise<{ cdp: Cdp; proc: ReturnType<typeof spawn> }> {
    const proc = spawn(
      CHROME,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--no-first-run",
        "--no-default-browser-check",
        `--remote-debugging-port=${PORT}`,
        "--user-data-dir=" + (process.env.CHROME_PROFILE ?? "C:\\Users\\HandlerOne\\AppData\\Local\\Temp\\opencode\\uat\\profile"),
        "--window-size=1400,1000",
        "about:blank",
      ],
      { stdio: "ignore" },
    );
    // Wait for the debugger endpoint.
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://localhost:${PORT}/json/version`);
        if (res.ok) break;
      } catch {
        /* not ready yet */
      }
      await sleep(250);
    }
    const list = (await (await fetch(`http://localhost:${PORT}/json`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
    const page = list.find((t) => t.type === "page");
    if (!page) throw new Error("No Chrome page target found");
    const cdp = new Cdp();
    await cdp.connect(page.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    return { cdp, proc };
  }

  private connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as { id?: number; method?: string; params?: unknown } & JsonRpc;
        if (typeof msg.id === "number") {
          const p = this.pending.get(msg.id);
          if (!p) return;
          this.pending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error.message));
          else p.resolve(msg.result);
        } else if (msg.method) {
          for (const fn of this.events.get(msg.method) ?? []) fn(msg.params);
        }
      };
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(new Error("CDP socket error: " + String(e)));
    });
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(event: string, fn: (params: unknown) => void) {
    const arr = this.events.get(event) ?? [];
    arr.push(fn);
    this.events.set(event, arr);
  }

  once(event: string): Promise<unknown> {
    return new Promise((resolve) => {
      const arr = this.events.get(event) ?? [];
      const fn = (params: unknown) => {
        const i = arr.indexOf(fn);
        if (i >= 0) arr.splice(i, 1);
        resolve(params);
      };
      arr.push(fn);
      this.events.set(event, arr);
    });
  }

  async setCookie(name: string, value: string, domain = "localhost", path = "/") {
    await this.send("Network.setCookie", { name, value, domain, path, httpOnly: true });
  }

  /** Navigate and wait for load (DOMContentLoaded + a short settle). */
  async navigate(url: string, waitMs = 900) {
    const done = this.once("Page.loadEventFired");
    await this.send("Page.navigate", { url });
    await Promise.race([done, sleep(6000)]);
    await sleep(waitMs);
  }

  /**
   * Polls a boolean page expression until it becomes true (or times out).
   * Essential for client-rendered pages (React Query) that show a "Memuat…"
   * placeholder after the load event.
   */
  async waitFor(expression: string, timeoutMs = 15000, intervalMs = 250): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if (await this.eval<boolean>(`!!(${expression})`)) return true;
      } catch {
        /* page may be mid-navigation */
      }
      await sleep(intervalMs);
    }
    return false;
  }

  /** Waits until the page is no longer showing a generic loading placeholder. */
  async waitForContent(timeoutMs = 15000) {
    return this.waitFor(`document.body && !/Memuat[.…]/i.test(document.body.innerText) && document.body.innerText.trim().length > 40`, timeoutMs);
  }

  /** Evaluate a JS expression in the page; returns the JSON value. */
  async eval<T = unknown>(expression: string): Promise<T> {
    const r = await this.send<{
      result: { value?: T };
      exceptionDetails?: { text?: string; exception?: { description?: string }; lineNumber?: number };
    }>("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? "unknown";
      throw new Error("eval error @line" + (r.exceptionDetails.lineNumber ?? "?") + ": " + d.split("\n")[0]);
    }
    return r.result.value as T;
  }

  /** Evaluate `fetch()` inside the page (same-origin, carries the session cookie). */
  async api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const expr = `(async () => {
      const res = await fetch(${JSON.stringify(BASE + path)}, {
        method: ${JSON.stringify(method)},
        headers: { 'Content-Type': 'application/json' },
        body: ${body === undefined ? "undefined" : `JSON.stringify(${JSON.stringify(body)})`},
      });
      const text = await res.text();
      let json = null; try { json = JSON.parse(text); } catch {}
      return { status: res.status, ok: res.ok, json };
    })()`;
    return this.eval<T>(expr);
  }

  async screenshot(filePathNoExt: string): Promise<string> {
    const r = await this.send<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(filePathNoExt + ".png", Buffer.from(r.data, "base64"));
    return filePathNoExt + ".png";
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}
