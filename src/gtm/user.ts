/**
 * setUserId — GA4 `user_id` with zero GTM config: `gtag('set', {user_id})` on the dataLayer, which every
 * Google tag in the container (GA4 included) applies to its following hits. Personalization consent only;
 * without it nothing is pushed. `null` clears it (logout). Browser only.
 */
import { consentFromDocument, type ReadOptions } from "../consent/core.js";
import { gtag } from "./datalayer.js";

export function setUserId(id: string | null, read?: ReadOptions): boolean {
  if (typeof window === "undefined") return false;
  if (!consentFromDocument(read)?.personalization) return false;
  gtag("set", { user_id: id });
  return true;
}
