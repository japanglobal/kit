import { describe, expect, it, vi } from "vitest";
import { clientIp, cloudflareClientIp, createLimiter, createTrackRoute, TRACK_LIMIT } from "../src/consent/server.js";
import { cookie } from "./fixtures.js";

const CC = (id: string) => `cc_cookie=${cookie({ expirationTime: Date.now() + 1e10, consentId: id })}`;
const req = (headers: Record<string, string>, body: BodyInit = JSON.stringify({ name: "logout", props: {} })) =>
  new Request("https://x.test/api/track", { method: "POST", body, headers: { cookie: CC("0b6f6c64-2b0e-4b8e-9a51-6b8c4c9a1f00"), ...headers } });
const route = (o: Partial<Parameters<typeof createTrackRoute>[0]> = {}) =>
  createTrackRoute({ posthog: { capture: vi.fn(), flush: vi.fn(async () => undefined) }, appId: "zucity", getMemberId: () => "m1", ...o });

describe("track route throttle (sec.4)", () => {
  it(`allows ${TRACK_LIMIT.requests}/min per IP, then 429 + Retry-After`, async () => {
    const POST = route();
    for (let i = 0; i < TRACK_LIMIT.requests; i++) expect((await POST(req({ "x-real-ip": "1.1.1.1" }))).status).toBe(204);
    const over = await POST(req({ "x-real-ip": "1.1.1.1" }));
    expect(over.status).toBe(429);
    expect(Number(over.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await POST(req({ "x-real-ip": "2.2.2.2" }))).status).toBe(204); // distinct IPs independent
  });

  it("window resets", () => {
    const l = createLimiter({ requests: 2, windowMs: 1000 });
    expect([l.hit("a", 0), l.hit("a", 10), l.hit("a", 20)]).toEqual([0, 0, 1]);
    expect(l.hit("a", 1000)).toBe(0);
  });

  it("100 people behind one NAT, each consenting once: all 204", async () => {
    const POST = route({ getMemberId: () => null });
    for (let i = 0; i < 100; i++) {
      const id = `0b6f6c64-2b0e-4b8e-9a51-${String(i).padStart(12, "0")}`;
      const r = await POST(req({ "x-real-ip": "9.9.9.9", cookie: CC(id) }, JSON.stringify({ name: "consent_updated", props: {} })));
      expect(r.status).toBe(204);
    }
  });

  it("key = x-real-ip: rotating X-Forwarded-For does not reset the budget", async () => {
    const POST = route({ limit: { requests: 3, windowMs: 60_000 } });
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await POST(req({ "x-real-ip": "3.3.3.3", "x-forwarded-for": `10.0.0.${i}` }))).status);
    expect(codes).toEqual([204, 204, 204, 429, 429]);
    expect(clientIp(new Headers({ "x-forwarded-for": "4.4.4.4, 10.0.0.1" }))).toBe("4.4.4.4");
  });

  it("cloudflareClientIp: cf-connecting-ip only with Cloudflare's origin secret; a forged header at the origin falls back", () => {
    const key = "k".repeat(32);
    const via = new Headers({ "x-real-ip": "172.70.0.1", "cf-connecting-ip": "8.8.8.8", "x-jgc-origin": key });
    const direct = new Headers({ "x-real-ip": "6.6.6.6", "cf-connecting-ip": "8.8.8.8" });
    const wrong = new Headers({ "x-real-ip": "6.6.6.6", "cf-connecting-ip": "8.8.8.8", "x-jgc-origin": "k".repeat(31) + "x" });
    expect(cloudflareClientIp(via, key)).toBe("8.8.8.8");
    expect(cloudflareClientIp(direct, key)).toBe("6.6.6.6");
    expect(cloudflareClientIp(wrong, key)).toBe("6.6.6.6");
    expect(cloudflareClientIp(via, null)).toBe("172.70.0.1"); // no key configured: never trust the header
  });

  it("spoofed cf-connecting-ip straight at the origin cannot dodge the throttle", async () => {
    const key = "k".repeat(32);
    const POST = route({ limit: { requests: 3, windowMs: 60_000 }, clientIp: (h) => cloudflareClientIp(h, key) });
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await POST(req({ "x-real-ip": "6.6.6.6", "cf-connecting-ip": `10.1.0.${i}` }))).status);
    expect(codes).toEqual([204, 204, 204, 429, 429]);
  });

  it("no IP header: never pooled into one shared bucket", async () => {
    const POST = route({ limit: { requests: 1, windowMs: 60_000 } });
    for (let i = 0; i < 20; i++) expect((await POST(req({}))).status).toBe(204);
  });

  it("limit: false turns it off", async () => {
    const POST = route({ limit: false });
    for (let i = 0; i < 5; i++) expect((await POST(req({ "x-real-ip": "5.5.5.5" }))).status).toBe(204);
  });

  it("memory bound: 10 001 IPs keep ≤ 10 000 windows", () => {
    const l = createLimiter({ requests: 1, windowMs: 60_000 });
    for (let i = 0; i <= 10_000; i++) l.hit(`ip${i}`, 0);
    expect(l.size()).toBe(10_000);
  });
});

describe("track route body cap", () => {
  it("> 8 KiB declared: 413 without reading", async () => {
    const POST = route();
    const big = JSON.stringify({ name: "logout", props: { a: "x".repeat(9000) } });
    expect((await POST(req({ "x-real-ip": "6.6.6.6" }, big))).status).toBe(413);
  });

  it("> 8 KiB streamed without content-length: 413", async () => {
    const POST = route();
    const chunk = new TextEncoder().encode("x".repeat(4096));
    let n = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (n++ < 100) c.enqueue(chunk);
        else c.close();
      },
    });
    const r = new Request("https://x.test/api/track", { method: "POST", body, headers: { "x-real-ip": "7.7.7.7" }, duplex: "half" } as RequestInit);
    expect((await POST(r)).status).toBe(413);
    expect(n).toBeLessThan(10); // stopped reading early
  });
});
