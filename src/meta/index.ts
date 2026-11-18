/**
 * Meta Pixel with zero Events Manager / GTM setup: the standard fbq base snippet (installed by
 * `<MetaPixel/>` after Personalization consent) and `metaPixelSink`, which maps the canonical
 * (GA4-named) events to Meta standard events. Browser only. The ONE GA4 → Meta name map lives here.
 */
import { skip, type Sink, type Skip } from "../track/core.js";
import type { TrackEvent } from "../track/types.js";
import { META_PIXEL_ID_RE } from "../env.js";

export { META_PIXEL_ID_RE };

export type Fbq = (...args: unknown[]) => void;

export const FBEVENTS_URL = "https://connect.facebook.net/en_US/fbevents.js";

/** Canonical event name → Meta standard event. Anything not listed never reaches the pixel. */
export const META_STANDARD_EVENTS: Readonly<Record<string, string>> = {
  purchase: "Purchase",
  begin_checkout: "InitiateCheckout",
  add_to_cart: "AddToCart",
  view_item: "ViewContent",
  generate_lead: "Lead",
  sign_up: "CompleteRegistration",
  search: "Search",
  add_payment_info: "AddPaymentInfo",
  add_to_wishlist: "AddToWishlist",
};

type PixelWindow = Window & { fbq?: Fbq & Record<string, unknown>; _fbq?: unknown; __jgcMetaPixels?: Set<string> };

/** window.fbq once the base snippet is installed; null before (or on the server). */
export function fbq(): Fbq | null {
  if (typeof window === "undefined") return null;
  const f = (window as PixelWindow).fbq;
  return typeof f === "function" ? f : null;
}

/**
 * Meta's base code, verbatim in behaviour: an fbq stub queueing calls until fbevents.js loads (once per
 * page), then `init` + `PageView` once per pixel id. Idempotent. The caller owns the consent check.
 * Returns false for a malformed id or outside a browser. fbevents.js itself fires PageView on
 * history.pushState, so client-side route changes are counted without extra code.
 */
export function installMetaPixel(id: string): boolean {
  if (typeof window === "undefined" || !META_PIXEL_ID_RE.test(id)) return false;
  const w = window as PixelWindow;
  if (!w.fbq) {
    // Meta's stub: queue `arguments` objects until fbevents.js sets callMethod.
    const n = function () {
      const self = n as unknown as { callMethod?: { apply(t: unknown, a: IArguments): void }; queue: unknown[] };
      // eslint-disable-next-line prefer-rest-params
      if (self.callMethod) self.callMethod.apply(n, arguments);
      // eslint-disable-next-line prefer-rest-params
      else self.queue.push(arguments);
    } as unknown as Fbq & Record<string, unknown>;
    w.fbq = n;
    w._fbq ??= n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    const s = document.createElement("script");
    s.id = "meta-pixel";
    s.async = true;
    s.src = FBEVENTS_URL;
    document.head.appendChild(s);
  }
  const inited = (w.__jgcMetaPixels ??= new Set());
  if (inited.has(id)) return true;
  inited.add(id);
  w.fbq("init", id);
  w.fbq("track", "PageView");
  return true;
}

/**
 * The browser Meta leg: `fbq('track', <Standard>, params, {eventID})` for a mapped name; `eventID` = the
 * event's uuid when it has one (dedup against the same event sent by CAPI). Unmapped ⇒ Skip("unmapped");
 * no pixel installed ⇒ Skip("no_pixel"). No policy here — consent and grants gate it in the chain.
 */
export const metaPixelSink =
  <E extends TrackEvent>(get: () => Fbq | null = fbq): Sink<E, true | Skip> =>
  (e) => {
    const std = Object.prototype.hasOwnProperty.call(META_STANDARD_EVENTS, e.name) ? META_STANDARD_EVENTS[e.name] : undefined;
    if (!std) return skip("unmapped");
    const f = get();
    if (!f) return skip("no_pixel");
    if (e.uuid) f("track", std, { ...e.props }, { eventID: e.uuid });
    else f("track", std, { ...e.props });
    return true;
  };
