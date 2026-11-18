/**
 * POST /api/track — the server door for mandatory events a browser sends without Personalization consent.
 * Accepts only CLIENT_MANDATORY_EVENTS (consent_updated, login, logout); everything else is 400, so a
 * browser can never forge a commerce fact. Consent facts come from the cookie, never from the body.
 * Abuse: per-IP throttle (429 + Retry-After) and a body cap (413), both before parsing (website-baseline sec.4).
 */
import { consentFromHeader, type ReadOptions } from "./core.js";
import { CLIENT_MANDATORY_EVENTS } from "../track/consent.js";
import type { PostHogNodeLike } from "../track/sinks.js";
import { kitEnv, missing } from "../env.js";

export interface TrackRouteOptions {
  readonly posthog: (PostHogNodeLike & { flush?: () => Promise<unknown> }) | null;
  /** Stamped as `app_id`. Default: NEXT_PUBLIC_JGC_APP_ID; missing ⇒ events are accepted and dropped. */
  readonly appId?: string;
  /** Default revision: NEXT_PUBLIC_JGC_CONSENT_REVISION. */
  readonly read?: ReadOptions;
  /** The signed-in member id from the request's session; never from the body. */
  readonly getMemberId?: (req: Request) => Promise<string | null> | string | null;
  readonly accept?: ReadonlySet<string>;
  /** next/server `after`, so the flush outlives the response on serverless. */
  readonly after?: (task: () => unknown) => void;
  /**
   * Per-IP throttle (fixed window, per server instance; the Vercel WAF rule in `firewall/` is the global cap).
   * Default 120 requests / 60 s — headroom for one venue Wi-Fi or mobile CGNAT. `false` = off.
   */
  readonly limit?: { readonly requests: number; readonly windowMs: number } | false;
  /** Largest accepted body; bigger = 413 before parsing. Default 8 KiB. */
  readonly maxBodyBytes?: number;
}

export const TRACK_LIMIT = { requests: 120, windowMs: 60_000 } as const;
export const TRACK_MAX_BODY = 8192;
/** Most IPs one instance remembers; the oldest window is evicted first. */
export const LIMITER_MAX_KEYS = 10_000;

/** The client IP Vercel sets (`x-real-ip`, else the first `x-forwarded-for` hop). Null = unknown: never pooled. */
export function clientIp(h: Headers): string | null {
  return h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

/** Fixed-window counter per key. Returns seconds until retry when over, else 0. */
export function createLimiter(o: { requests: number; windowMs: number }, maxKeys = LIMITER_MAX_KEYS) {
  const windows = new Map<string, { start: number; count: number }>();
  const hit = (key: string, now = Date.now()): number => {
    let w = windows.get(key);
    if (!w || now - w.start >= o.windowMs) {
      windows.delete(key);
      if (windows.size >= maxKeys) windows.delete(windows.keys().next().value!);
      w = { start: now, count: 0 };
      windows.set(key, w);
    }
    w.count += 1;
    return w.count > o.requests ? Math.max(1, Math.ceil((w.start + o.windowMs - now) / 1000)) : 0;
  };
  return { hit, size: () => windows.size };
}

/** The body as text, or null once it passes `max` bytes (stops reading; never buffers more). */
async function readCapped(req: Request, max: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

type Prop = string | number | boolean | null;
const MAX_KEYS = 32;
const MAX_STR = 256;

function cleanProps(x: unknown): Record<string, Prop> | null {
  if (x === undefined) return {};
  if (typeof x !== "object" || x === null || Array.isArray(x)) return null;
  const entries = Object.entries(x);
  if (entries.length > MAX_KEYS) return null;
  const out: Record<string, Prop> = {};
  for (const [k, v] of entries) {
    if (k.startsWith("$") || k.length > 64) return null;
    if (typeof v === "string") {
      if (v.length > MAX_STR) return null;
    } else if (typeof v === "number") {
      if (!Number.isFinite(v)) return null;
    } else if (typeof v !== "boolean" && v !== null) return null;
    out[k] = v as Prop;
  }
  return out;
}

const bad = (why: string): Response => new Response(why, { status: 400 });

export function createTrackRoute(o: TrackRouteOptions): (req: Request) => Promise<Response> {
  const accept = o.accept ?? CLIENT_MANDATORY_EVENTS;
  const appId = o.appId ?? kitEnv().appId;
  if (!appId) missing("NEXT_PUBLIC_JGC_APP_ID", "The track route");
  const limiter = o.limit === false ? null : createLimiter(o.limit ?? TRACK_LIMIT);
  const maxBody = o.maxBodyBytes ?? TRACK_MAX_BODY;
  return async (req) => {
    const ip = limiter && clientIp(req.headers);
    const wait = ip ? limiter!.hit(ip) : 0;
    if (wait) return new Response("rate", { status: 429, headers: { "Retry-After": String(wait) } });
    const text = await readCapped(req, maxBody);
    if (text === null) return new Response("size", { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return bad("body");
    }
    if (typeof body !== "object" || body === null) return bad("body");
    const { name, props, uuid } = body as { name?: unknown; props?: unknown; uuid?: unknown };
    if (typeof name !== "string" || !accept.has(name)) return bad("name");
    if (uuid !== undefined && (typeof uuid !== "string" || !/^[0-9a-f-]{36}$/i.test(uuid))) return bad("uuid");
    const clean = cleanProps(props);
    if (!clean) return bad("props");

    const consent = consentFromHeader(req.headers.get("cookie"), o.read);
    const member = (await o.getMemberId?.(req)) ?? null;
    if (name === "login" && !member) return bad("member");
    if (name === "consent_updated" && !consent) return bad("consent");
    const distinctId = member ?? consent?.id;
    if (!distinctId) return bad("person");

    const properties: Record<string, unknown> = { ...clean, app_id: appId };
    if (!member) properties.$process_person_profile = false;
    if (name === "consent_updated" && consent) {
      Object.assign(properties, {
        v: consent.revision,
        personalization: consent.personalization,
        partners: consent.partners,
        consent_id: consent.id,
        country: req.headers.get("x-vercel-ip-country") ?? null,
      });
      if (member) {
        properties.$set = {
          consent_personalization: consent.personalization,
          consent_partners: consent.partners,
          consent_v: consent.revision,
        };
      }
    }
    if (o.posthog && appId) {
      o.posthog.capture({ distinctId, event: name, properties, uuid: uuid as string | undefined });
      const flush = (): unknown => o.posthog?.flush?.();
      if (o.after) o.after(flush);
      else await flush();
    }
    return new Response(null, { status: 204 });
  };
}
