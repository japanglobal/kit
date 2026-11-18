/**
 * The standard JGC chains. A site adopts one in a line and can still stack its own gates on top.
 *
 * Client: PostHog when Personalization is granted; otherwise only mandatory events, via the server.
 *         gtag events on the dataLayer (the GTM container's tags — GA4, Meta — take them from there), only with
 *         Personalization + the site's grant. Never exempt.
 * Server: PostHog with the mandatory exemption; every ads leg wrapped in a non-exempt consent gate.
 */
import { either, fanOut, gate, label, map, pipe, safe, skip, type Pred, type Sink, type Skip } from "./core.js";
import { consented, isMandatory, type ConsentSource } from "./consent.js";
import { beaconSink, dataLayerSink, posthogNodeSink, posthogSink, type PostHogLike, type PostHogNodeLike } from "./sinks.js";
import type { TrackEvent } from "./types.js";
import type { ReadOptions } from "../consent/core.js";
import { kitEnv, missing } from "../env.js";

const withAppId =
  (appId: string) =>
  <E extends TrackEvent>(e: E): E => ({ ...e, props: { ...e.props, app_id: appId } });

/** Every event is dropped (one dev error) when no app id is configured. */
const noAppId = <E>(): Sink<E, Skip[]> => {
  missing("NEXT_PUBLIC_JGC_APP_ID", "Tracking");
  return () => [skip("no_app_id")];
};

/** A browser ads leg: always gated on Personalization (never exempt), then the site's grant, then scrubbed. */
export interface AdsLeg<E, T> {
  /** Test seam: the transport (default window.dataLayer). */
  readonly get?: () => T | null;
  readonly grant: Pred<E>;
  readonly scrub?: (e: E) => E;
}

export interface ClientTrackerOptions<E extends TrackEvent> {
  /** Stamped as `app_id`. Default: NEXT_PUBLIC_JGC_APP_ID; missing ⇒ the tracker drops everything. */
  readonly appId?: string;
  /** posthog-js once initialised; null when the site has no key. */
  readonly posthog: PostHogLike | null;
  /** The site's policy revision (stale cookies are no consent). Default: NEXT_PUBLIC_JGC_CONSENT_REVISION. */
  readonly read?: ReadOptions;
  /** Default: NEXT_PUBLIC_JGC_TRACK_URL. */
  readonly beaconUrl?: string;
  /** GA4 leg ("gtm": gtag `event` commands the container's Google tag sends, zero GTM config): on only when
   *  set. `grant` = the site's ads allow-list; `scrub` strips keys the platform must not see. */
  readonly dataLayer?: AdsLeg<E, unknown[]>;
  /** Test seam; default reads document.cookie. */
  readonly consent?: ConsentSource<E>;
}

export function createClientTracker<E extends TrackEvent>(o: ClientTrackerOptions<E>): Sink<E, unknown[]> {
  const env = kitEnv();
  const appId = o.appId ?? env.appId;
  if (!appId) return noAppId<E>();
  const personal = consented<E>("personalization", { consent: o.consent, read: o.read });
  const stamp = map<E>(withAppId(appId));
  const posthog = label("posthog")(
    either<E, true | Skip, boolean | Skip>(
      personal,
      o.posthog ? posthogSink<E>(o.posthog) : (): Skip => skip("no_key"),
      pipe(beaconSink<E>(o.beaconUrl ?? env.trackUrl), gate<E>(isMandatory, "no_consent")),
    ),
  );
  const ads = (plane: string, sink: Sink<E, unknown>, leg: AdsLeg<E, unknown>): Sink<E, unknown> =>
    safe(label(plane)(pipe(sink, gate(personal, "no_consent"), gate(leg.grant, "no_grant"), stamp, map<E>(leg.scrub ?? ((e) => e)))));
  const legs: Sink<E, unknown>[] = [safe(posthog)];
  if (o.dataLayer) legs.push(ads("gtm", dataLayerSink<E>(o.dataLayer.get), o.dataLayer));
  return fanOut(...legs);
}

export interface ServerTrackerOptions<E extends TrackEvent> {
  /** Stamped as `app_id` on every leg. Default: NEXT_PUBLIC_JGC_APP_ID; missing ⇒ the tracker drops everything. */
  readonly appId?: string;
  readonly posthog: PostHogNodeLike | null;
  readonly distinctId: (e: E) => string;
  /** This request's consent (readConsent of its Cookie header), or the consent stored with the attempt. */
  readonly consent: ConsentSource<E>;
  /** Ads legs by plane name (unlabelled). Each is gated here on Personalization with NO exemption, then labelled. */
  readonly ads?: Readonly<Record<string, Sink<E, unknown>>>;
}

export function createServerTracker<E extends TrackEvent>(o: ServerTrackerOptions<E>): Sink<E, unknown[]> {
  const appId = o.appId ?? kitEnv().appId;
  if (!appId) return noAppId<E>();
  const stamp = map<E>(withAppId(appId));
  const product = consented<E>("personalization", { consent: o.consent, exempt: isMandatory });
  const ads = consented<E>("personalization", { consent: o.consent });
  const posthog = label("posthog")(
    o.posthog ? pipe(posthogNodeSink<E>(o.posthog, o.distinctId), gate(product, "no_consent"), stamp) : () => skip("no_key"),
  );
  const legs = Object.entries(o.ads ?? {}).map(([plane, leg]) => safe(label(plane)(pipe(leg, gate(ads, "no_consent"), stamp))));
  return fanOut<E, unknown>(safe(posthog), ...legs);
}
