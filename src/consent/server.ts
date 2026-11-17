/**
 * POST /api/track — the server door for mandatory events a browser sends without Personalization consent.
 * Accepts only CLIENT_MANDATORY_EVENTS (consent_updated, login, logout); everything else is 400, so a
 * browser can never forge a commerce fact. Consent facts come from the cookie, never from the body.
 */
import { consentFromHeader, type ReadOptions } from "./core.js";
import { CLIENT_MANDATORY_EVENTS } from "../track/consent.js";
import type { PostHogNodeLike } from "../track/sinks.js";

export interface TrackRouteOptions {
  readonly posthog: (PostHogNodeLike & { flush?: () => Promise<unknown> }) | null;
  readonly appId: string;
  readonly read?: ReadOptions;
  /** The signed-in member id from the request's session; never from the body. */
  readonly getMemberId?: (req: Request) => Promise<string | null> | string | null;
  readonly accept?: ReadonlySet<string>;
  /** next/server `after`, so the flush outlives the response on serverless. */
  readonly after?: (task: () => unknown) => void;
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
  return async (req) => {
    let body: unknown;
    try {
      body = await req.json();
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

    const properties: Record<string, unknown> = { ...clean, app_id: o.appId };
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
    if (o.posthog) {
      o.posthog.capture({ distinctId, event: name, properties, uuid: uuid as string | undefined });
      const flush = (): unknown => o.posthog?.flush?.();
      if (o.after) o.after(flush);
      else await flush();
    }
    return new Response(null, { status: 204 });
  };
}
