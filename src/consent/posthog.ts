/**
 * posthog-js ⇄ consent. Init opted-out with in-memory persistence unless Personalization is already
 * granted; then follow every decision: grant → opt in + persist; withdraw → opt out, reset, memory.
 */
import { consentFromDocument, type Consent, type ReadOptions } from "./core.js";

export interface PostHogConsentLike {
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
