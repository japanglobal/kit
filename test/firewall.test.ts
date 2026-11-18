import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) => JSON.parse(readFileSync(new URL(`../firewall/${f}`, import.meta.url), "utf8"));
const ips = read("cloudflare-ips.json");
type Cond = { type: string; op: string; neg?: boolean; value?: unknown; key?: string };
const conds = (f: string): Cond[] => read(f).conditionGroup.flatMap((g: { conditions: Cond[] }) => g.conditions);

describe("Vercel WAF rules (website-baseline sec.4, sec.7)", () => {
  it("cloudflare ranges: generated data, v4 + v6", () => {
    expect(ips.ipv4.length).toBeGreaterThan(10);
    expect(ips.ipv6.length).toBeGreaterThan(5);
    for (const c of [...ips.ipv4, ...ips.ipv6]) expect(c).toMatch(/^[0-9a-f:.]+\/\d+$/);
  });

  it.each(["origin-lock-cloudflare-ips.json", "origin-lock-header.json"])("%s: production only, cron + .well-known exempt, staged in log mode", (f) => {
    const c = conds(f);
    expect(c).toContainEqual({ type: "environment", op: "eq", value: "production" });
    expect(c).toContainEqual({ type: "path", op: "pre", neg: true, value: "/api/cron/" });
    expect(c).toContainEqual({ type: "path", op: "pre", neg: true, value: "/.well-known/" });
    expect(read(f).action.mitigate.action).toBe("log");
  });

  it("IP rule: every Cloudflare range, negated (deny = not from Cloudflare)", () => {
    const ip = conds("origin-lock-cloudflare-ips.json").find((c) => c.type === "ip_address")!;
    expect(ip).toMatchObject({ op: "inc", neg: true });
    expect(ip.value).toEqual([...ips.ipv4, ...ips.ipv6]);
  });

  it("header rule: the secret is a placeholder, never committed", () => {
    const h = conds("origin-lock-header.json").find((c) => c.type === "header")!;
    expect(h).toMatchObject({ key: "x-jgc-origin", op: "eq", neg: true, value: "${JGC_ORIGIN_KEY}" });
  });

  it("track throttle rule: POST /api/track by IP, log mode", () => {
    const r = read("track-rate-limit.json");
    expect(conds("track-rate-limit.json")).toEqual([
      { type: "path", op: "eq", value: "/api/track" },
      { type: "method", op: "eq", value: "POST" },
    ]);
    expect(r.action.mitigate).toMatchObject({ action: "rate_limit", rateLimit: { keys: ["ip"], action: "log" } });
  });
});
