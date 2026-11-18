import { describe, expect, it } from "vitest";
import {
  buildCsp,
  checkSecurityHeaders,
  ga4,
  googleAds,
  gtm,
  metaPixel,
  origin,
  parseCsp,
  posthog,
  privy,
  securityHeaders,
  stripe,
  withSecurity,
} from "../src/security/index.js";

const SITE = [gtm, ga4, googleAds, metaPixel, posthog];
const clean = () => securityHeaders({ sources: SITE, dev: false });
const swap = (k: string, v: string | null) => {
  const h = clean().filter((x) => x.key !== k);
  return v === null ? h : [...h, { key: k, value: v }];
};
const csp = () => clean().find((h) => h.key === "Content-Security-Policy")!.value;

describe("buildCsp", () => {
  it("starts at 'self' with object/base/form/frame-ancestors locked", () => {
    const d = parseCsp(buildCsp({ dev: false }));
    expect(d.get("default-src")).toEqual(["'self'"]);
    expect(d.get("object-src")).toEqual(["'none'"]);
    expect(d.get("base-uri")).toEqual(["'self'"]);
    expect(d.get("form-action")).toEqual(["'self'"]);
    expect(d.get("frame-ancestors")).toEqual(["'none'"]);
    expect(d.get("connect-src")).toEqual(["'self'"]);
  });

  it("never emits 'unsafe-eval' outside development", () => {
    expect(buildCsp({ sources: SITE, dev: false })).not.toContain("unsafe-eval");
    expect(buildCsp({ sources: SITE })).not.toContain("unsafe-eval"); // NODE_ENV=test
    expect(parseCsp(buildCsp({ dev: true })).get("script-src")).toContain("'unsafe-eval'");
  });

  it("merges presets per directive without duplicates", () => {
    const d = parseCsp(buildCsp({ sources: [gtm, gtm, ga4], dev: false }));
    expect(d.get("script-src")!.filter((s) => s === "https://www.googletagmanager.com")).toHaveLength(1);
    expect(d.get("connect-src")).toEqual(expect.arrayContaining(["https://*.google-analytics.com", "https://*.analytics.google.com"]));
  });

  it("ga4 admits the apex collect host; metaPixel admits the param builder by exact path, never the CDN", () => {
    const d = parseCsp(buildCsp({ sources: [ga4, metaPixel], dev: false }));
    expect(d.get("connect-src")).toContain("https://analytics.google.com");
    expect(d.get("script-src")!.filter((s) => /jsdelivr|unpkg/.test(s)).every((s) => s.endsWith("/clientParamBuilder.bundle.js"))).toBe(true);
  });

  it("privy: custom api domain, wallets, bundlers, telegram on request only", () => {
    const bare = parseCsp(buildCsp({ sources: [privy()], dev: false }));
    expect(bare.get("connect-src")).not.toContain("wss://relay.walletconnect.com");
    expect(bare.get("frame-src")).toEqual(expect.arrayContaining(["https://auth.privy.io", "https://challenges.cloudflare.com"]));
    const full = parseCsp(
      buildCsp({
        sources: [privy({ customApiUrl: "https://privy.zucity.org/", walletConnect: true, telegram: true, bundlers: ["https://public.pimlico.io/v2"], bridging: true })],
        dev: false,
      }),
    );
    expect(full.get("connect-src")).toEqual(
      expect.arrayContaining(["https://privy.zucity.org", "wss://relay.walletconnect.org", "https://public.pimlico.io", "https://api.relay.link"]),
    );
    expect(full.get("frame-src")).toEqual(expect.arrayContaining(["https://oauth.telegram.org", "https://privy.zucity.org"]));
    expect(full.get("script-src")).toEqual(expect.arrayContaining(["https://auth.privy.io", "https://telegram.org"]));
  });

  it("origin(): https/wss only", () => {
    expect(origin("https://rpc.example.com/v1?key=x")).toBe("https://rpc.example.com");
    expect(() => origin("http://rpc.example.com")).toThrow();
  });

  it("report-uri + report-to when asked", () => {
    const h = securityHeaders({ reportUri: "/ingest/report/?token=phc_x", dev: false });
    expect(h.find((x) => x.key === "Content-Security-Policy")!.value).toMatch(/report-uri \/ingest\/report\/\?token=phc_x; report-to csp$/);
    expect(h.find((x) => x.key === "Reporting-Endpoints")!.value).toBe('csp="/ingest/report/?token=phc_x"');
  });
});

describe("checkSecurityHeaders (catch rate on planted positives)", () => {
  it("clean set: 0 findings (every preset incl. privy + stripe)", () => {
    expect(checkSecurityHeaders(clean())).toEqual([]);
    expect(checkSecurityHeaders(securityHeaders({ sources: [...SITE, privy({ walletConnect: true }), stripe], dev: false }))).toEqual([]);
  });

  const planted: [string, ReturnType<typeof clean>][] = [
    ["missing HSTS", swap("Strict-Transport-Security", null)],
    ["weak HSTS", swap("Strict-Transport-Security", "max-age=300")],
    ["'unsafe-eval'", swap("Content-Security-Policy", csp().replace("script-src 'self'", "script-src 'self' 'unsafe-eval'"))],
    ["script-src *", swap("Content-Security-Policy", csp().replace("script-src 'self'", "script-src *"))],
    ["connect-src https:", swap("Content-Security-Policy", csp().replace("connect-src 'self'", "connect-src 'self' https:"))],
    ["no frame-ancestors", swap("Content-Security-Policy", csp().replace("; frame-ancestors 'none'", ""))],
    ["frame-ancestors open", swap("Content-Security-Policy", csp().replace("frame-ancestors 'none'", "frame-ancestors https://evil.test"))],
    ["object-src not none", swap("Content-Security-Policy", csp().replace("object-src 'none'", "object-src 'self'"))],
    ["script-src data:", swap("Content-Security-Policy", csp().replace("script-src 'self'", "script-src 'self' data:"))],
    ["missing CSP", swap("Content-Security-Policy", null)],
    ["nosniff off", swap("X-Content-Type-Options", "sniff")],
    ["XFO SAMEORIGIN", swap("X-Frame-Options", "SAMEORIGIN")],
    ["referrer unsafe-url", swap("Referrer-Policy", "unsafe-url")],
    ["x-powered-by", [...clean(), { key: "X-Powered-By", value: "Next.js" }]],
    ["missing permissions-policy", swap("Permissions-Policy", null)],
    // evaluator plants (2026-11-18): host wildcards, keyword case, navigation directives
    ["object-src *", swap("Content-Security-Policy", csp().replace("object-src 'none'", "object-src *"))],
    ["script-src https://*", swap("Content-Security-Policy", csp().replace("script-src 'self'", "script-src 'self' https://*"))],
    ["script-src *.com", swap("Content-Security-Policy", csp().replace("script-src 'self'", "script-src 'self' *.com"))],
    ["connect-src https://*.com", swap("Content-Security-Policy", csp().replace("connect-src 'self'", "connect-src 'self' https://*.com"))],
    ["'UNSAFE-EVAL'", swap("Content-Security-Policy", csp().replace("script-src 'self'", "script-src 'self' 'UNSAFE-EVAL'"))],
    ["base-uri https:", swap("Content-Security-Policy", csp().replace("base-uri 'self'", "base-uri https:"))],
    ["form-action https:", swap("Content-Security-Policy", csp().replace("form-action 'self'", "form-action https:"))],
    ["HTTPS: in connect-src", swap("Content-Security-Policy", csp().replace("connect-src 'self'", "connect-src 'self' HTTPS:"))],
    // evaluator iteration-2 plants: wildcards over multi-label / private public suffixes
    ["connect-src https://*.co.jp", swap("Content-Security-Policy", csp().replace("connect-src 'self'", "connect-src 'self' https://*.co.jp"))],
    ["script-src *.co.uk", swap("Content-Security-Policy", csp().replace("script-src 'self'", "script-src 'self' *.co.uk"))],
    ["script-src *.com.", swap("Content-Security-Policy", csp().replace("script-src 'self'", "script-src 'self' *.com."))],
    ["frame-src https://*.vercel.app", swap("Content-Security-Policy", csp().replace("frame-src 'self'", "frame-src 'self' https://*.vercel.app"))],
    ["img-src https://*.com.au", swap("Content-Security-Policy", csp().replace("img-src 'self'", "img-src 'self' https://*.com.au"))],
    ["script-src-attr unsafe-eval", swap("Content-Security-Policy", `${csp()}; script-src-attr 'unsafe-eval'`)],
  ];
  it.each(planted)("catches %s", (_, h) => {
    expect(checkSecurityHeaders(h).length).toBeGreaterThan(0);
  });

  it("img-src https: is the one allowed scheme-wide source; dev tolerates eval only when told", () => {
    expect(checkSecurityHeaders(securityHeaders({ sources: [...SITE, { "img-src": ["https:"] }], dev: false }))).toEqual([]);
    const devSet = securityHeaders({ sources: SITE, dev: true });
    expect(checkSecurityHeaders(devSet)).toContain("csp: script-src 'unsafe-eval'");
    expect(checkSecurityHeaders(devSet, { dev: true })).toEqual([]);
  });

  it("a wildcard under a registrable domain is fine (*.example.co.jp, *.tiles.mapbox.com)", () => {
    const h = securityHeaders({ sources: [{ "connect-src": ["https://*.example.co.jp", "https://*.tiles.mapbox.com"] }], dev: false });
    expect(checkSecurityHeaders(h)).toEqual([]);
  });

  it("reads fetch Headers too", () => {
    expect(checkSecurityHeaders(new Headers(clean().map((x): [string, string] => [x.key, x.value])))).toEqual([]);
  });
});

describe("withSecurity", () => {
  const cors = [
    { source: "/api/public/:path*", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] },
    { source: "/api/:path*", headers: [{ key: "Access-Control-Allow-Origin", value: "https://zucity.org" }] },
  ];

  it("keeps the config's own headers verbatim and appends the set for every path", async () => {
    const c = withSecurity({ reactStrictMode: true, headers: async () => cors }, { sources: SITE, dev: false });
    const out = await c.headers();
    expect(out.slice(0, 2)).toEqual(cors);
    expect(out[2]!.source).toBe("/:path*");
    expect(checkSecurityHeaders(out[2]!.headers)).toEqual([]);
    expect(c.reactStrictMode).toBe(true);
  });

  it("forces poweredByHeader + browser source maps off; works with no headers()", async () => {
    const c = withSecurity({ poweredByHeader: true, productionBrowserSourceMaps: true }, { dev: false });
    expect(c.poweredByHeader).toBe(false);
    expect(c.productionBrowserSourceMaps).toBe(false);
    expect(await c.headers()).toHaveLength(1);
  });
});
