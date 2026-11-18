// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readConsent } from "../src/consent/core.js";
import { setUserId } from "../src/gtm/index.js";
import { MANDATORY_EVENTS } from "../src/track/consent.js";
import { createClientTracker } from "../src/track/presets.js";
import type { TrackEvent } from "../src/track/types.js";
import { cookie, names, NOW } from "./fixtures.js";

type W = Window & { fbq?: unknown; dataLayer?: unknown[] };
const w = window as W;
const grant = (categories = ["necessary", "personalization"]) => {
  document.cookie = `cc_cookie=${cookie({ categories, expirationTime: Date.now() + 1e10 })}; path=/`;
  window.dispatchEvent(new Event("cc:onChange"));
};

beforeEach(() => {
  delete w.dataLayer;
  document.head.innerHTML = "";
});
afterEach(() => {
  vi.unstubAllEnvs();
  document.cookie = "cc_cookie=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("the kit ships no Meta code — Meta lives only in the GTM container", () => {
  it("no ./meta subpath export", () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf8")) as { exports: Record<string, unknown> };
    expect(Object.keys(pkg.exports).filter((k) => /meta/i.test(k))).toEqual([]);
  });
});

describe("createClientTracker — gtm leg × consent × grant", () => {
  const events: TrackEvent[] = [...new Set([...MANDATORY_EVENTS, "purchase", "generate_lead", ...names(100)])].map((name) => ({ name }));
  const make = (consent: () => ReturnType<typeof readConsent>, grantFn = () => true) => {
    const layer: unknown[] = [];
    vi.stubGlobal("navigator", { sendBeacon: vi.fn(() => true) });
    const track = createClientTracker<TrackEvent>({ appId: "test", posthog: null, consent, dataLayer: { get: () => layer, grant: grantFn } });
    return { track, layer };
  };
  afterEach(() => vi.unstubAllGlobals());

  it("no consent ⇒ zero gtag pushes (mandatory names included — ads legs never exempt); no fbq ever", () => {
    const c = make(() => null);
    const reports = events.map((e) => c.track(e));
    expect(c.layer).toEqual([]);
    expect(reports[0]).toContainEqual({ skipped: `gtm:${events[0]!.name}:no_consent` });
    expect(w.fbq).toBeUndefined();
  });

  it("consent + grant ⇒ every event is one gtag ('event', …) command; no fbq", () => {
    const c = make(() => readConsent(cookie(), { now: NOW }));
    events.forEach((e) => c.track(e));
    expect(c.layer.length).toBe(events.length);
    expect(w.fbq).toBeUndefined();
  });

  it("consent without the site's grant ⇒ nothing on the gtm leg", () => {
    const c = make(() => readConsent(cookie(), { now: NOW }), () => false);
    expect(c.track({ name: "purchase" })).toContainEqual({ skipped: "gtm:purchase:no_grant" });
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
