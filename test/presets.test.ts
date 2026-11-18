import { describe, expect, it, vi } from "vitest";
import { readConsent } from "../src/consent/core.js";
import { MANDATORY_EVENTS } from "../src/track/consent.js";
import { createClientTracker, createServerTracker } from "../src/track/presets.js";
import type { TrackEvent } from "../src/track/types.js";
import { cookie, names, NOW } from "./fixtures.js";

const GRANTED = () => readConsent(cookie(), { now: NOW });
const NONE = () => null;
const events: TrackEvent[] = [...MANDATORY_EVENTS, ...names(200), "add_to_cart", "view_item"].map((name) => ({ name }));

function client(consent: () => ReturnType<typeof GRANTED>) {
  const ph = { capture: vi.fn() };
  const layer: unknown[] = [];
  const gtag = vi.fn((x: unknown) => layer.push(x));
  const beacon = vi.fn(() => true);
  vi.stubGlobal("navigator", { sendBeacon: beacon });
  const track = createClientTracker<TrackEvent>({
    appId: "test",
    posthog: ph,
    consent,
    dataLayer: { get: () => ({ push: gtag }) as unknown as unknown[], grant: () => true },
  });
  return { track, ph, gtag, beacon, layer };
}

function server(consent: () => ReturnType<typeof GRANTED>) {
  const ph = { capture: vi.fn() };
  const ga4 = vi.fn(() => true);
  const meta = vi.fn(() => true);
  const track = createServerTracker<TrackEvent>({ posthog: ph, distinctId: () => "m1", consent, ads: { ga4, meta } });
  return { track, ph, ga4, meta };
}

describe("client preset — consent × mandatory × plane", () => {
  it("no consent: nothing reaches the dataLayer; mandatory → beacon only; the rest go nowhere", () => {
    const c = client(NONE);
    const reports = events.map((e) => c.track(e));
    expect(c.gtag).not.toHaveBeenCalled();
    expect(c.ph.capture).not.toHaveBeenCalled();
    expect(c.beacon).toHaveBeenCalledTimes(MANDATORY_EVENTS.size);
    for (const call of c.beacon.mock.calls as unknown as [string][]) expect(call[0]).toBe("/api/track");
    expect(reports.flat().filter((r) => typeof r === "object" && r && "skipped" in r).length).toBeGreaterThan(events.length);
  });

  it("consent: PostHog and the dataLayer receive everything; no beacon; pushes carry event, app_id, event_id", () => {
    const c = client(GRANTED);
    events.forEach((e) => c.track(e));
    c.track({ name: "purchase", props: { value: 1 }, uuid: "u-1" });
    expect(c.ph.capture).toHaveBeenCalledTimes(events.length + 1);
    expect(c.gtag).toHaveBeenCalledTimes(events.length + 1);
    expect(c.beacon).not.toHaveBeenCalled();
    expect(c.layer[0]).toMatchObject({ event: events[0]!.name, app_id: "test" });
    expect(c.layer.at(-1)).toEqual({ event: "purchase", value: 1, app_id: "test", event_id: "u-1" });
  });

  it("the dataLayer leg respects the grant", () => {
    const layer: unknown[] = [];
    const t = createClientTracker<TrackEvent>({ appId: "a", posthog: null, consent: GRANTED, dataLayer: { get: () => layer, grant: () => false } });
    expect(t({ name: "login" })).toContainEqual({ skipped: "gtm:login:no_grant" });
    expect(layer).toEqual([]);
  });
});

describe("server preset — ads legs are never exempt", () => {
  it("no consent: mandatory reach PostHog; ads skip with ga4/meta:<name>:no_consent", () => {
    const s = server(NONE);
    const reports = events.map((e) => s.track(e));
    expect(s.ga4).not.toHaveBeenCalled();
    expect(s.meta).not.toHaveBeenCalled();
    expect(s.ph.capture).toHaveBeenCalledTimes(MANDATORY_EVENTS.size);
    expect(reports[0]).toContainEqual({ skipped: `ga4:${events[0]!.name}:no_consent` });
    expect(reports[0]).toContainEqual({ skipped: `meta:${events[0]!.name}:no_consent` });
  });

  it("purchase reaches PostHog with no consent (H3 read unaffected)", () => {
    const s = server(NONE);
    s.track({ name: "purchase", props: { value: 1 } });
    expect(s.ph.capture).toHaveBeenCalledWith(expect.objectContaining({ event: "purchase", distinctId: "m1" }));
  });

  it("consent: every leg sends", () => {
    const s = server(GRANTED);
    events.forEach((e) => s.track(e));
    expect(s.ga4).toHaveBeenCalledTimes(events.length);
    expect(s.meta).toHaveBeenCalledTimes(events.length);
    expect(s.ph.capture).toHaveBeenCalledTimes(events.length);
  });

  it("a throwing leg never breaks the others", () => {
    const ph = { capture: vi.fn() };
    const t = createServerTracker<TrackEvent>({ posthog: ph, distinctId: () => "m", consent: GRANTED, ads: { bad: () => { throw new Error("x"); } } });
    expect(t({ name: "purchase" })).toContainEqual({ skipped: "error" });
    expect(ph.capture).toHaveBeenCalled();
  });
});
