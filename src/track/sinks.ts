/** Thin transports. No policy here — policy is gate/map in the chain. */
import { skip, type Sink, type Skip } from "./core.js";
import type { TrackEvent } from "./types.js";

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

export type Gtag = (...args: unknown[]) => void;

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

/** gtag('event', …). Skip when gtag is absent (no measurement id, or consent never loaded it). */
export const gtagSink =
  <E extends TrackEvent>(get: () => Gtag | undefined = defaultGtag): Sink<E, true | Skip> =>
  (e) => {
    const g = get();
    if (!g) return skip("no_gtag");
    g("event", e.name, { ...e.props });
    return true;
  };

function defaultGtag(): Gtag | undefined {
  return typeof window === "undefined" ? undefined : (window as unknown as { gtag?: Gtag }).gtag;
}

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
