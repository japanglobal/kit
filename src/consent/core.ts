/**
 * Consent core — edge-safe, zero dependencies. Reads the `vanilla-cookieconsent`
 * cookie on the client (document.cookie), in middleware and in route handlers
 * (the Cookie header). Anything unreadable is NO consent: deny is the default.
 */
import { kitEnv } from "../env.js";

export type Category = "necessary" | "personalization" | "partners";
export type OptionalCategory = Exclude<Category, "necessary">;

export const CONSENT_COOKIE = "cc_cookie";
export const ONE_YEAR_DAYS = 365;

export interface Consent {
  readonly personalization: boolean;
  readonly partners: boolean;
  /** vanilla-cookieconsent's consentId — the proof id carried by `consent_updated`. */
  readonly id: string;
  readonly revision: number;
  /** ISO time of the last decision. */
  readonly at: string;
}

export interface ReadOptions {
  /** The site's current policy revision; a cookie from another revision is no consent (re-prompt).
   *  Default: NEXT_PUBLIC_JGC_CONSENT_REVISION (1 when unset). */
  readonly revision?: number;
  readonly now?: number;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function decode(raw: string): unknown {
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

/** Parse a raw `cc_cookie` value. Malformed, expired or stale-revision (≠ the site's revision) ⇒ null. */
export function readConsent(raw: string | null | undefined, opts: ReadOptions = {}): Consent | null {
  if (!raw || raw.length > 4096) return null;
  const v = decode(raw);
  if (!isObj(v)) return null;
  const { categories, revision, consentId, expirationTime, lastConsentTimestamp } = v;
  if (!Array.isArray(categories) || !categories.every((c) => typeof c === "string")) return null;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) return null;
  if (typeof consentId !== "string" || consentId.length === 0 || consentId.length > 64) return null;
  if (typeof expirationTime !== "number" || expirationTime <= (opts.now ?? Date.now())) return null;
  if (revision !== (opts.revision ?? kitEnv().consentRevision)) return null;
  return {
    personalization: categories.includes("personalization"),
    partners: categories.includes("partners"),
    id: consentId,
    revision,
    at: typeof lastConsentTimestamp === "string" ? lastConsentTimestamp : "",
  };
}

/** One cookie's raw value out of a Cookie header or `document.cookie`. */
export function cookieValue(header: string | null | undefined, name: string = CONSENT_COOKIE): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** Consent from a Cookie header (middleware, route handlers). */
export const consentFromHeader = (header: string | null | undefined, opts?: ReadOptions): Consent | null =>
  readConsent(cookieValue(header), opts);

/** Consent from `document.cookie`; null on the server. */
export const consentFromDocument = (opts?: ReadOptions): Consent | null =>
  typeof document === "undefined" ? null : consentFromHeader(document.cookie, opts);
