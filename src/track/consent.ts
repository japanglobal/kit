/**
 * The ONE consent predicate. Use it with gate() to drop, or either() to route.
 *
 * MANDATORY_EVENTS may bypass consent only on the first-party product plane and only through the
 * server (no device storage or read). Ads legs never take `exempt` — the presets hard-code that.
 */
import { consentFromDocument, type Consent, type OptionalCategory, type ReadOptions } from "../consent/core.js";
import type { Pred } from "./core.js";

/** Events processed without cookie consent (contract / legal obligation), server-side, product plane only. */
export const MANDATORY_EVENTS: ReadonlySet<string> = new Set([
  "consent_updated",
  "login",
  "logout",
  "sign_up",
  "purchase",
  "refund",
  "stay_redeemed",
  "referral_attributed",
]);

/**
 * The subset a browser may send to /api/track. Commerce and growth facts (purchase, refund, sign_up,
 * stay_redeemed, referral_attributed) are server-emitted only: accepting them from a browser would let
 * anyone forge revenue.
 */
export const CLIENT_MANDATORY_EVENTS: ReadonlySet<string> = new Set(["consent_updated", "login", "logout"]);

export const isMandatory = (e: { readonly name: string }): boolean => MANDATORY_EVENTS.has(e.name);

export type ConsentSource<E> = (e: E) => Consent | null;

export interface ConsentedOptions<E> {
  /** Where consent comes from. Default: `document.cookie` (client). Server: the request's cookie. */
  readonly consent?: ConsentSource<E>;
  /** Events that pass without consent. Product plane only — never on an ads leg. */
  readonly exempt?: Pred<E>;
  /** Default-source read options (the site's policy revision). */
  readonly read?: ReadOptions;
}

export function consented<E extends { readonly name: string }>(
  category: OptionalCategory,
  opts: ConsentedOptions<E> = {},
): Pred<E> {
  const source: ConsentSource<E> = opts.consent ?? (() => consentFromDocument(opts.read));
  return (e) => (opts.exempt?.(e) ?? false) || (source(e)?.[category] ?? false);
}
