/**
 * Security headers for every JGC site (vault website-baseline sec.*). One wrapper — `withSecurity(nextConfig, opts)` —
 * adds the header set; the CSP starts at 'self' and an origin enters only through a preset (a feature) or a cited
 * site-local `extra`. `checkSecurityHeaders` is the falsifier: site tests and live probes run it on real headers.
 */
import { isDevelopment } from "../env.js";

export { auditFindings, type AllowEntry, type Finding } from "./audit.js";

export type Directive =
  | "script-src"
  | "style-src"
  | "img-src"
  | "font-src"
  | "connect-src"
  | "frame-src"
  | "child-src"
  | "worker-src"
  | "media-src"
  | "manifest-src";

/** Origins one feature adds, per directive. */
export type CspSources = Partial<Record<Directive, readonly string[]>>;

/** GTM container loader + its noscript/preview frame (Google, "Use a Content Security Policy" for Tag Manager). */
export const gtm: CspSources = {
  "script-src": ["https://www.googletagmanager.com"],
  "img-src": ["https://www.googletagmanager.com"],
  "connect-src": ["https://www.googletagmanager.com"],
  "frame-src": ["https://www.googletagmanager.com"],
};

/**
 * GA4 via the container's Google tag: collect hits on regional subdomains (Google CSP guide, GA4 section) and on the
 * apex `analytics.google.com/g/collect` (live probe 2026-11-18 — `*.` never matches the apex).
 */
export const ga4: CspSources = {
  "script-src": ["https://*.googletagmanager.com"],
  "img-src": ["https://*.google-analytics.com", "https://*.googletagmanager.com"],
  "connect-src": [
    "https://*.google-analytics.com",
    "https://analytics.google.com",
    "https://*.analytics.google.com",
    "https://*.googletagmanager.com",
  ],
};

/**
 * Google Ads conversion + remarketing tags in the container (Google CSP guide, Ads section; live GTM-5V6ZLSZ5 probe
 * 2026-11-18: ad/stats/td.doubleclick.net, pagead2 + ade.googlesyndication.com, adservice.google.com, www.google.co.jp).
 */
export const googleAds: CspSources = {
  "script-src": ["https://www.googleadservices.com", "https://googleads.g.doubleclick.net", "https://www.google.com"],
  "img-src": ["https://*.doubleclick.net", "https://www.google.com", "https://www.google.co.jp", "https://pagead2.googlesyndication.com"],
  "connect-src": [
    "https://*.doubleclick.net",
    "https://www.googleadservices.com",
    "https://www.google.com",
    "https://www.google.co.jp",
    "https://pagead2.googlesyndication.com",
    "https://ade.googlesyndication.com",
    "https://adservice.google.com",
  ],
  "frame-src": ["https://td.doubleclick.net"],
};

/**
 * Meta Pixel tag in the container: fbevents.js + signals config, `/tr` beacons (Meta Pixel developer docs). Its GTM
 * template also loads Meta's CAPI Parameter Builder (npm `meta-capi-param-builder-clientjs`, published by Meta) from
 * jsDelivr, unpkg as fallback (live probe 2026-11-18) — admitted by exact file path only, never the CDN host.
 */
export const metaPixel: CspSources = {
  "script-src": [
    "https://connect.facebook.net",
    "https://cdn.jsdelivr.net/npm/meta-capi-param-builder-clientjs/dist/clientParamBuilder.bundle.js",
    "https://unpkg.com/meta-capi-param-builder-clientjs/dist/clientParamBuilder.bundle.js",
  ],
  "img-src": ["https://www.facebook.com"],
  "connect-src": ["https://connect.facebook.net", "https://www.facebook.com"],
};

/** PostHog through the site's own `/ingest` rewrite: same origin, plus the session-recording worker. */
export const posthog: CspSources = {
  "worker-src": ["blob:"],
};

/** Stripe.js + Elements (Stripe docs, "Content Security Policy"). Checkout/Connect are navigations: no entry. */
export const stripe: CspSources = {
  "script-src": ["https://js.stripe.com", "https://*.js.stripe.com"],
  "frame-src": ["https://js.stripe.com", "https://*.js.stripe.com", "https://hooks.stripe.com"],
  "connect-src": ["https://api.stripe.com"],
};

/** Cloudflare Turnstile widget (Cloudflare Turnstile docs, CSP section). */
export const turnstile: CspSources = {
  "script-src": ["https://challenges.cloudflare.com"],
  "frame-src": ["https://challenges.cloudflare.com"],
};

export interface PrivyOptions {
  /** The app's `custom_api_url` (HttpOnly-cookie mode), e.g. `https://privy.zucity.org`. */
  readonly customApiUrl?: string;
  /** WalletConnect / Coinbase external wallets. */
  readonly walletConnect?: boolean;
  /** Telegram login. */
  readonly telegram?: boolean;
  /** Smart-wallet bundler / paymaster origins (e.g. `https://public.pimlico.io`). */
  readonly bundlers?: readonly string[];
  /** Cross-chain bridging (`api.relay.link`). */
  readonly bridging?: boolean;
}

/** Privy (Privy docs, "Content Security Policy"; options from the app's live config `auth.privy.io/api/v1/apps/<id>`). */
export function privy(o: PrivyOptions = {}): CspSources {
  const api = o.customApiUrl ? [origin(o.customApiUrl)] : [];
  const wc = o.walletConnect
    ? {
        connect: [
          "wss://relay.walletconnect.com",
          "wss://relay.walletconnect.org",
          "wss://www.walletlink.org",
          "https://explorer-api.walletconnect.com",
          "https://api.web3modal.org",
          "https://pulse.walletconnect.org",
        ],
        frame: ["https://verify.walletconnect.com", "https://verify.walletconnect.org"],
      }
    : { connect: [], frame: [] };
  return {
    // Privy's modal runs Turnstile when captcha is on (Privy CSP list carries it). Telegram's widget script is
    // served from auth.privy.io/js/telegram-login.js (live probe 2026-11-18), then telegram.org.
    "script-src": [...turnstile["script-src"]!, ...(o.telegram ? ["https://auth.privy.io", "https://telegram.org"] : [])],
    "connect-src": [
      "https://auth.privy.io",
      "https://*.rpc.privy.systems",
      ...api,
      ...wc.connect,
      ...(o.bundlers ?? []).map(origin),
      ...(o.bridging ? ["https://api.relay.link"] : []),
    ],
    // HttpOnly-cookie mode serves Privy's iframe from the custom API domain too (live probe 2026-11-18).
    "frame-src": ["https://auth.privy.io", ...api, ...turnstile["frame-src"]!, ...wc.frame, ...(o.telegram ? ["https://oauth.telegram.org"] : [])],
    "child-src": ["https://auth.privy.io", ...api, ...wc.frame],
  };
}

/** `https://host[:port]` of a URL — the CSP source for an env-configured endpoint. Throws on a non-https URL. */
export function origin(url: string): string {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "wss:") throw new Error(`@japanglobal/kit/security: ${url} is not https/wss`);
  return u.origin;
}

const BASE: Record<string, readonly string[]> = {
  "default-src": ["'self'"],
  // 'unsafe-inline': Next's inline bootstrap on prerendered pages (nonces force dynamic rendering). The one exception.
  "script-src": ["'self'", "'unsafe-inline'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:"],
  "font-src": ["'self'", "data:"],
  "connect-src": ["'self'"],
  "frame-src": ["'self'"],
  "child-src": ["'self'", "blob:"],
  "worker-src": ["'self'"],
  "media-src": ["'self'"],
  "manifest-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
};

export interface CspOptions {
  /** Feature presets and cited site-local extras, merged per directive. */
  readonly sources?: readonly CspSources[];
  /** CSP violation reports (e.g. PostHog `/ingest/report/?token=<key>`). */
  readonly reportUri?: string;
  /** Default: NODE_ENV === "development" — adds 'unsafe-eval' (React dev tooling). Never in a production build. */
  readonly dev?: boolean;
}

export function buildCsp(o: CspOptions = {}): string {
  const out = new Map<string, string[]>(Object.entries(BASE).map(([k, v]) => [k, [...v]]));
  for (const src of o.sources ?? []) {
    for (const [k, v] of Object.entries(src)) {
      const cur = out.get(k)!;
      for (const s of v ?? []) if (!cur.includes(s)) cur.push(s);
    }
  }
  if (o.dev ?? isDevelopment()) out.get("script-src")!.push("'unsafe-eval'");
  const parts = [...out].map(([k, v]) => `${k} ${v.join(" ")}`);
  if (o.reportUri) parts.push(`report-uri ${o.reportUri}`, "report-to csp");
  return parts.join("; ");
}

export interface Header {
  readonly key: string;
  readonly value: string;
}

export const HSTS = "max-age=63072000; includeSubDomains; preload";

/** The full header set for every response. */
export function securityHeaders(o: CspOptions = {}): Header[] {
  return [
    { key: "Content-Security-Policy", value: buildCsp(o) },
    { key: "Strict-Transport-Security", value: HSTS },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Only what no JGC feature uses; payment, passkeys (publickey-credentials-*) and attribution-reporting stay allowed.
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
    ...(o.reportUri ? [{ key: "Reporting-Endpoints", value: `csp="${o.reportUri}"` }] : []),
  ];
}

interface HeaderRule {
  source: string;
  headers: Header[];
  [k: string]: unknown;
}
interface NextConfigLike {
  headers?: () => Promise<HeaderRule[]> | HeaderRule[];
  poweredByHeader?: boolean;
  productionBrowserSourceMaps?: boolean;
}

/**
 * Wrap a Next config: its own `headers()` entries are kept verbatim, the security set is appended for every path,
 * `X-Powered-By` and browser source maps are off.
 */
export function withSecurity<C extends NextConfigLike>(
  config: C,
  o: CspOptions = {},
): Omit<C, "headers" | "poweredByHeader" | "productionBrowserSourceMaps"> & {
  headers: () => Promise<HeaderRule[]>;
  poweredByHeader: false;
  productionBrowserSourceMaps: false;
} {
  const own = config.headers;
  return {
    ...config,
    poweredByHeader: false as const,
    productionBrowserSourceMaps: false as const,
    async headers() {
      return [...((await own?.()) ?? []), { source: "/:path*", headers: securityHeaders(o) }];
    },
  };
}

const REQUIRED = ["content-security-policy", "strict-transport-security", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy"];
const REFERRER_OK = new Set(["strict-origin-when-cross-origin", "strict-origin", "same-origin", "no-referrer"]);
/** Directives that load code or carry data out: no wildcard, scheme-only or eval source. img-src may be `https:`. */
const STRICT = ["default-src", "script-src", "script-src-elem", "connect-src", "frame-src", "child-src", "worker-src", "object-src"];

export function parseCsp(csp: string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const part of csp.split(";")) {
    const [name, ...vals] = part.trim().split(/\s+/);
    if (name && !m.has(name.toLowerCase())) m.set(name.toLowerCase(), vals);
  }
  return m;
}

/**
 * Every way a response's headers break sec.*: [] = compliant. Accepts a fetch `Headers`, a plain record, or the
 * `{key,value}[]` Next config form. `dev: true` tolerates 'unsafe-eval' (never pass it for a production probe).
 */
export function checkSecurityHeaders(h: Headers | Record<string, string> | readonly Header[], o: { dev?: boolean } = {}): string[] {
  const get = lookup(h);
  const out: string[] = [];
  for (const k of REQUIRED) if (!get(k)) out.push(`missing ${k}`);
  const hsts = get("strict-transport-security");
  if (hsts && !(Number(/max-age=(\d+)/i.exec(hsts)?.[1] ?? 0) >= 31536000 && /includesubdomains/i.test(hsts))) out.push("hsts: max-age < 1y or no includeSubDomains");
  const nosniff = get("x-content-type-options");
  if (nosniff && nosniff.toLowerCase() !== "nosniff") out.push("x-content-type-options != nosniff");
  const xfo = get("x-frame-options");
  if (xfo && xfo.toUpperCase() !== "DENY") out.push("x-frame-options != DENY");
  const ref = get("referrer-policy");
  if (ref && !REFERRER_OK.has(ref.toLowerCase())) out.push(`referrer-policy ${ref} leaks paths cross-origin`);
  if (get("x-powered-by")) out.push("x-powered-by present");
  const raw = get("content-security-policy");
  if (raw) {
    const csp = parseCsp(raw);
    for (const d of ["default-src", "object-src", "base-uri", "frame-ancestors", "form-action"]) if (!csp.has(d)) out.push(`csp: no ${d}`);
    if (csp.get("object-src")?.join(" ") !== "'none'") out.push("csp: object-src != 'none'");
    const fa = csp.get("frame-ancestors");
    if (fa && fa.join(" ") !== "'none'" && fa.join(" ") !== "'self'") out.push("csp: frame-ancestors admits other origins");
    for (const [d, vals] of csp) {
      if (vals.includes("*")) out.push(`csp: ${d} *`);
      if (!STRICT.includes(d)) continue;
      for (const v of vals) {
        if (v === "'unsafe-eval'" && !o.dev) out.push(`csp: ${d} 'unsafe-eval'`);
        if (/^(https?|wss?|data|blob):$/i.test(v) && !(v === "blob:" && ["worker-src", "child-src"].includes(d))) out.push(`csp: ${d} ${v} (scheme-wide)`);
      }
    }
  }
  return out;
}

function lookup(h: Headers | Record<string, string> | readonly Header[]): (k: string) => string | undefined {
  if (typeof (h as Headers).get === "function") return (k) => (h as Headers).get(k) ?? undefined;
  const m = new Map<string, string>();
  if (Array.isArray(h)) for (const { key, value } of h as readonly Header[]) m.set(key.toLowerCase(), value);
  else for (const [k, v] of Object.entries(h)) m.set(k.toLowerCase(), v);
  return (k) => m.get(k);
}
