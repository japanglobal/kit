/** window.dataLayer — the one queue GTM (and the GA4 Google tag inside it) reads. Browser only. */

type Layer = unknown[];

export function dataLayer(): Layer | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { dataLayer?: Layer };
  w.dataLayer ??= [];
  return w.dataLayer;
}

/**
 * Push a gtag command onto `layer` as an `arguments` object — the only shape Google's tags execute
 * (an array or a bare `{event}` object reaches no GA4 tag without GTM UI setup).
 */
export function gtagOn(layer: unknown[] | null, ...args: unknown[]): void {
  if (!layer) return;
  (function push(..._a: unknown[]) {
    // eslint-disable-next-line prefer-rest-params
    layer.push(arguments);
  })(...args);
}

/** A gtag() command (consent, set, event) on window.dataLayer — GA4 in the GTM container reads it with zero config. */
export function gtag(...args: unknown[]): void {
  gtagOn(dataLayer(), ...args);
}

export const CONSENT_GRANTED = {
  ad_storage: "granted",
  analytics_storage: "granted",
  ad_user_data: "granted",
  ad_personalization: "granted",
} as const;

export const CONSENT_DENIED = {
  ad_storage: "denied",
  analytics_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
} as const;
