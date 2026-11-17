/**
 * posthog-js ⇄ consent. PostHog is not even started before Personalization is granted (init alone
 * fetches remote config and flags): `initWhenConsented` runs the site's init now or on the first grant.
 * After that, follow every decision: grant → opt in + persist; withdraw → opt out, reset, memory.
 */
import { consentFromDocument, type Consent, type ReadOptions } from "./core.js";

export interface PostHogConsentLike {
  /** posthog-js sets this once init ran; an un-started client is left alone. */
  __loaded?: boolean;
  opt_in_capturing(): void;
  opt_out_capturing(): void;
  has_opted_out_capturing(): boolean;
  set_config(config: Record<string, unknown>): void;
  reset(): void;
  stopSessionRecording?(): void;
}

export function posthogInitOptions(read?: ReadOptions): {
  opt_out_capturing_by_default: boolean;
  persistence: "memory" | "localStorage+cookie";
} {
  return consentFromDocument(read)?.personalization
    ? { opt_out_capturing_by_default: false, persistence: "localStorage+cookie" }
    : { opt_out_capturing_by_default: true, persistence: "memory" };
}

export function applyConsentToPostHog(ph: PostHogConsentLike, consent: Consent | null): void {
  if (ph.__loaded === false) return;
  if (consent?.personalization) {
    ph.set_config({ persistence: "localStorage+cookie" });
    if (ph.has_opted_out_capturing()) ph.opt_in_capturing();
    return;
  }
  if (ph.has_opted_out_capturing()) return;
  ph.stopSessionRecording?.();
  ph.opt_out_capturing();
  ph.reset();
  ph.set_config({ persistence: "memory" });
}

const DECISIONS = ["cc:onConsent", "cc:onChange"] as const;

/**
 * Run `init` (the site's posthog.init) only once Personalization is granted: now if it already is,
 * else on the first decision that grants it. Returns an unsubscribe. Browser only.
 */
export function initWhenConsented(init: () => void, read?: ReadOptions): () => void {
  if (typeof window === "undefined") return () => undefined;
  let done = false;
  const tryInit = (): void => {
    if (done || !consentFromDocument(read)?.personalization) return;
    done = true;
    off();
    init();
  };
  const off = (): void => {
    for (const e of DECISIONS) window.removeEventListener(e, tryInit);
  };
  for (const e of DECISIONS) window.addEventListener(e, tryInit);
  tryInit();
  return off;
}
