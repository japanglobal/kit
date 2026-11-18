/** Thin transports. No policy here — policy is gate/map in the chain. */
import { skip, type Sink, type Skip } from "./core.js";
import type { TrackEvent } from "./types.js";
import { dataLayer, gtagOn } from "../gtm/datalayer.js";

export interface PostHogLike {
  capture(name: string, props?: Record<string, unknown>, options?: Record<string, unknown>): unknown;
}

export interface PostHogNodeLike {
  capture(msg: {
    distinctId: string;
    event: string;
    properties?: Record<string, unknown>;
    uuid?: string;
    timestamp?: Date;
  }): unknown;
}

/** posthog-js capture. */
export const posthogSink =
  <E extends TrackEvent>(ph: PostHogLike): Sink<E, true> =>
  (e) => {
    if (e.uuid) ph.capture(e.name, { ...e.props }, { uuid: e.uuid });
    else ph.capture(e.name, { ...e.props });
    return true;
  };

/** posthog-node capture; `distinctId` resolves the person per event. */
export const posthogNodeSink =
  <E extends TrackEvent>(client: PostHogNodeLike, distinctId: (e: E) => string): Sink<E, true> =>
  (e) => {
    client.capture({ distinctId: distinctId(e), event: e.name, properties: { ...e.props }, uuid: e.uuid });
    return true;
  };

/**
 * GA4 through GTM with zero container config: a gtag `('event', name, {...props, event_id?})` command
 * (an `arguments` object) on window.dataLayer — the GA4 Google tag in the container sends it as-is.
 * `event_id` = the event's uuid when it has one (dedup key shared with the Meta Pixel ⇄ CAPI).
 */
export const dataLayerSink =
  <E extends TrackEvent>(get: () => unknown[] | null = dataLayer): Sink<E, true | Skip> =>
  (e) => {
    const layer = get();
    if (!layer) return skip("no_browser");
    gtagOn(layer, "event", e.name, { ...e.props, ...(e.uuid ? { event_id: e.uuid } : {}) });
    return true;
  };

/** Fire-and-forget JSON POST from the browser (survives navigation). */
export const beaconSink =
  <E extends TrackEvent>(url: string): Sink<E, boolean | Skip> =>
  (e) => {
    if (typeof navigator === "undefined") return skip("no_browser");
    const body = JSON.stringify({ name: e.name, props: e.props ?? {}, uuid: e.uuid });
    if (typeof navigator.sendBeacon === "function") {
      return navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    }
    void fetch(url, { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } });
    return true;
  };

/** Server POST; `request` builds url + body per event, or returns a Skip (missing env, stale event…). */
export const jsonPostSink =
  <E>(request: (e: E) => { url: string; body: unknown } | Skip): Sink<E, Promise<boolean> | Skip> =>
  (e) => {
    const r = request(e);
    if ("skipped" in r) return r;
    return fetch(r.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(r.body),
    }).then((res) => res.ok);
  };
