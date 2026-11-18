/** window.dataLayer — the one queue GTM (and the GA4 Google tag inside it) reads. Browser only. */

type Layer = unknown[];

export function dataLayer(): Layer | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { dataLayer?: Layer };
  w.dataLayer ??= [];
  return w.dataLayer;
}

/** A gtag() command (consent, set, config) on the dataLayer — the shape Google's tags read. */
export function gtag(...args: unknown[]): void {
  const layer = dataLayer();
  if (!layer) return;
  // gtag commands must be pushed as an `arguments` object, not an array.
  (function push(..._a: unknown[]) {
    // eslint-disable-next-line prefer-rest-params
    layer.push(arguments);
  })(...args);
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
