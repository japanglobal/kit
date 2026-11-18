// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readConsent } from "../src/consent/core.js";
import { setUserId } from "../src/gtm/index.js";
import { FBEVENTS_URL, installMetaPixel, META_STANDARD_EVENTS, metaPixelSink } from "../src/meta/index.js";
import { MetaPixel } from "../src/meta/react.js";
import { MANDATORY_EVENTS } from "../src/track/consent.js";
import { createClientTracker } from "../src/track/presets.js";
import type { TrackEvent } from "../src/track/types.js";
import { cookie, names, NOW } from "./fixtures.js";

type W = Window & { fbq?: unknown; _fbq?: unknown; __jgcMetaPixels?: Set<string>; dataLayer?: unknown[] };
const w = window as W;
const grant = (categories = ["necessary", "personalization"]) => {
  document.cookie = `cc_cookie=${cookie({ categories, expirationTime: Date.now() + 1e10 })}; path=/`;
  window.dispatchEvent(new Event("cc:onChange"));
};
const fbqQueue = (): unknown[][] => ((w.fbq as { queue?: ArrayLike<unknown>[] } | undefined)?.queue ?? []).map((a) => Array.from(a));
const pixelScripts = () => document.querySelectorAll(`script[src="${FBEVENTS_URL}"]`);

beforeEach(() => {
  delete w.fbq;
  delete w._fbq;
  delete w.__jgcMetaPixels;
  delete w.dataLayer;
  document.head.innerHTML = "";
});
afterEach(() => {
  vi.unstubAllEnvs();
  document.cookie = "cc_cookie=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("<MetaPixel/> — consent-gated base code", () => {
  it("nothing before consent; after Personalization: fbevents.js once, fbq('init', id) + PageView once", () => {
    const view = render(<MetaPixel id="123456789012345" />);
    expect(w.fbq).toBeUndefined();
    expect(pixelScripts().length).toBe(0);
    act(() => grant());
    expect(pixelScripts().length).toBe(1);
    expect(fbqQueue()).toEqual([
      ["init", "123456789012345"],
      ["track", "PageView"],
    ]);
    // the stub queues `arguments` objects, as Meta's own snippet does
    expect(Object.prototype.toString.call((w.fbq as { queue: unknown[] }).queue[0])).toBe("[object Arguments]");
    view.rerender(<MetaPixel id="123456789012345" />);
    render(<MetaPixel id="123456789012345" />);
    expect(pixelScripts().length).toBe(1);
    expect(fbqQueue().length).toBe(2);
  });

  it("Reject all / Partners only / malformed id / id={null}: no script, no fbq", () => {
    grant(["necessary"]);
    render(<MetaPixel id="123456789012345" />);
    act(() => grant(["necessary", "partners"]));
    expect(w.fbq).toBeUndefined();
    act(() => grant());
    render(<><MetaPixel id="evil.js" /><MetaPixel id="12345" /><MetaPixel id={null} /></>);
    expect(pixelScripts().length).toBe(1); // only the valid, granted one above
    expect(fbqQueue().filter((c) => c[0] === "init").map((c) => c[1])).toEqual(["123456789012345"]);
  });

  it("id defaults to NEXT_PUBLIC_META_PIXEL_ID; unset ⇒ nothing", () => {
    grant();
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "");
    render(<MetaPixel />);
    expect(w.fbq).toBeUndefined();
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "987654321");
    render(<MetaPixel />);
    expect(fbqQueue()).toEqual([["init", "987654321"], ["track", "PageView"]]);
  });

  it("installMetaPixel is idempotent per id and refuses malformed ids", () => {
    expect(installMetaPixel("abc")).toBe(false);
    expect(installMetaPixel("123456")).toBe(true);
    expect(installMetaPixel("123456")).toBe(true);
    expect(installMetaPixel("654321")).toBe(true);
    expect(pixelScripts().length).toBe(1);
    expect(fbqQueue()).toEqual([["init", "123456"], ["track", "PageView"], ["init", "654321"], ["track", "PageView"]]);
  });
});

describe("metaPixelSink — canonical → Meta standard events", () => {
  const MAP: [string, string][] = [
    ["purchase", "Purchase"],
    ["begin_checkout", "InitiateCheckout"],
    ["add_to_cart", "AddToCart"],
    ["view_item", "ViewContent"],
    ["generate_lead", "Lead"],
    ["sign_up", "CompleteRegistration"],
    ["search", "Search"],
    ["add_payment_info", "AddPaymentInfo"],
    ["add_to_wishlist", "AddToWishlist"],
  ];
  it("the map is exactly the contract's nine", () => {
    expect(META_STANDARD_EVENTS).toEqual(Object.fromEntries(MAP));
  });

  it.each(MAP)("%s → fbq('track', %s, params, {eventID: uuid})", (name, std) => {
    const f = vi.fn();
    expect(metaPixelSink(() => f)({ name, props: { value: 1, currency: "USD" }, uuid: "u-1" })).toBe(true);
    expect(f).toHaveBeenCalledWith("track", std, { value: 1, currency: "USD" }, { eventID: "u-1" });
  });

  it("no uuid ⇒ no eventID option", () => {
    const f = vi.fn();
    metaPixelSink(() => f)({ name: "search", props: { search_term: "onsen" } });
    expect(f).toHaveBeenCalledWith("track", "Search", { search_term: "onsen" });
  });

  it("unmapped names (incl. prototype keys) are never sent: Skip('unmapped'); no pixel ⇒ Skip('no_pixel')", () => {
    const f = vi.fn();
    for (const name of ["share", "select_content", "PageView", "Purchase", "toString", "__proto__", "constructor", ...names(50)]) {
      expect(metaPixelSink(() => f)({ name })).toEqual({ skipped: "unmapped" });
    }
    expect(f).not.toHaveBeenCalled();
    expect(metaPixelSink(() => null)({ name: "purchase" })).toEqual({ skipped: "no_pixel" });
  });
});

describe("createClientTracker — meta leg × consent × grant", () => {
  const events: TrackEvent[] = [...new Set([...MANDATORY_EVENTS, ...Object.keys(META_STANDARD_EVENTS), ...names(100)])].map((name) => ({ name }));
  const make = (consent: () => ReturnType<typeof readConsent>, grantFn = () => true) => {
    const f = vi.fn();
    const layer: unknown[] = [];
    vi.stubGlobal("navigator", { sendBeacon: vi.fn(() => true) });
    const track = createClientTracker<TrackEvent>({
      appId: "test",
      posthog: null,
      consent,
      dataLayer: { get: () => layer, grant: grantFn },
      meta: { get: () => f, grant: grantFn, scrub: (e) => ({ ...e, props: { ...e.props, email: undefined } }) },
    });
    return { track, f, layer };
  };
  afterEach(() => vi.unstubAllGlobals());

  it("no consent ⇒ zero fbq calls and zero gtag pushes (mandatory names included — ads legs never exempt)", () => {
    const c = make(() => null);
    const reports = events.map((e) => c.track(e));
    expect(c.f).not.toHaveBeenCalled();
    expect(c.layer).toEqual([]);
    expect(reports[0]).toContainEqual({ skipped: `meta:${events[0]!.name}:no_consent` });
  });

  it("consent + grant ⇒ mapped names reach fbq (app_id stamped, scrubbed); unmapped skip", () => {
    const c = make(() => readConsent(cookie(), { now: NOW }));
    const reports = events.map((e) => c.track(e));
    expect(c.f).toHaveBeenCalledTimes(Object.keys(META_STANDARD_EVENTS).length);
    expect(c.f).toHaveBeenCalledWith("track", "Purchase", { app_id: "test", email: undefined });
    expect(reports.flat()).toContainEqual({ skipped: `meta:${events.at(-1)!.name}:unmapped` });
    expect(c.layer.length).toBe(events.length);
  });

  it("consent without the site's grant ⇒ nothing on either ads leg", () => {
    const c = make(() => readConsent(cookie(), { now: NOW }), () => false);
    expect(c.track({ name: "purchase" })).toContainEqual({ skipped: "meta:purchase:no_grant" });
    expect(c.f).not.toHaveBeenCalled();
    expect(c.layer).toEqual([]);
  });
});

describe("setUserId — gtag('set', {user_id}) only with Personalization", () => {
  it("no consent / Reject all ⇒ nothing pushed", () => {
    expect(setUserId("m-1")).toBe(false);
    grant(["necessary"]);
    expect(setUserId("m-1")).toBe(false);
    expect(w.dataLayer ?? []).toEqual([]);
  });

  it("granted ⇒ ('set', {user_id}) as an Arguments object; null clears", () => {
    grant();
    expect(setUserId("m-1")).toBe(true);
    expect(setUserId(null)).toBe(true);
    const layer = w.dataLayer!;
    expect(Object.prototype.toString.call(layer[0])).toBe("[object Arguments]");
    expect(layer.map((a) => Array.from(a as ArrayLike<unknown>))).toEqual([
      ["set", { user_id: "m-1" }],
      ["set", { user_id: null }],
    ]);
  });
});
