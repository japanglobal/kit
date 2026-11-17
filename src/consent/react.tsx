"use client";
/**
 * <Consent/> mounts the banner once per page load; useConsent() / <ConsentGate/> read the live decision;
 * <CookieSettingsButton/> reopens the preferences (withdrawal as easy as consent).
 */
import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { consentFromDocument, cookieValue, readConsent, type Consent, type OptionalCategory, type ReadOptions } from "./core.js";
import { defineConsent, globToRegExp, type ConsentSiteConfig } from "./config.js";
import { applyConsentToPostHog, type PostHogConsentLike } from "./posthog.js";

const load = () => import("vanilla-cookieconsent");
const EVENTS = ["cc:onConsent", "cc:onChange"] as const;

export interface ConsentProps {
  readonly config: Omit<ConsentSiteConfig, "gpc" | "callbacks">;
  /** posthog-js, when the site runs it: follows every decision. */
  readonly posthog?: PostHogConsentLike | null;
  /** Where `consent_updated` is recorded (server, posthog-node). */
  readonly trackUrl?: string;
}

/** Google Consent Mode: a running gtag stops writing cookies the moment Personalization is withdrawn. */
function denyGtag(): void {
  const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
  gtag?.("consent", "update", {
    ad_storage: "denied",
    analytics_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
}

function record(url: string, source: "banner" | "settings", gpc: boolean): void {
  const body = JSON.stringify({ name: "consent_updated", props: { source, gpc } });
  if (typeof navigator.sendBeacon === "function") navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
  else void fetch(url, { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } });
}

export function Consent({ config, posthog = null, trackUrl = "/api/track" }: ConsentProps): null {
  const read: ReadOptions = { revision: config.revision ?? 1 };
  useEffect(() => {
    let live = true;
    void load().then((CC) => {
      if (!live) return;
      const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
      const apply = (): void => {
        const c = consentFromDocument(read);
        if (posthog) applyConsentToPostHog(posthog, c);
        if (c && !c.personalization) denyGtag();
      };
      const sweep = (): void => {
        // A tag can rewrite a cookie after the withdrawal clear (gtag refreshes `_ga_<id>` on unload): every
        // load with a decision erases the declined categories' cookies again. Stateless, idempotent.
        const c = consentFromDocument(read);
        if (!c) return;
        const declined = (["personalization", "partners"] as const).filter((k) => !c[k]);
        const names = declined.flatMap((k) => config.vendors[k].flatMap((v) => (v.cookies ?? []).map(globToRegExp)));
        if (names.length > 0) CC.eraseCookies(names);
      };
      void CC.run(
        defineConsent({
          ...config,
          gpc,
          callbacks: {
            onConsent: () => {
              apply();
              sweep();
            },
            onFirstConsent: () => record(trackUrl, "banner", gpc),
            onChange: () => {
              apply();
              record(trackUrl, "settings", gpc);
            },
          },
        }),
      );
    });
    return () => {
      live = false;
    };
    // One banner per page load; language follows below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void load().then((CC) => CC.setLanguage(config.lang, true));
  }, [config.lang]);
  return null;
}

const subscribe = (notify: () => void): (() => void) => {
  for (const e of EVENTS) window.addEventListener(e, notify);
  return () => {
    for (const e of EVENTS) window.removeEventListener(e, notify);
  };
};

/** The current decision (null = none, or invalid/expired/stale). Re-renders on every decision. */
export function useConsent(read?: ReadOptions): Consent | null {
  const raw = useSyncExternalStore(
    subscribe,
    () => cookieValue(document.cookie),
    () => null,
  );
  const revision = read?.revision;
  return useMemo(() => readConsent(raw, { revision }), [raw, revision]);
}

/** Render children only while `category` is granted (GA4 tags, Vercel Analytics…). */
export function ConsentGate({
  category,
  read,
  children,
}: {
  category: OptionalCategory;
  read?: ReadOptions;
  children: ReactNode;
}): ReactNode {
  return useConsent(read)?.[category] ? children : null;
}

export function CookieSettingsButton({ className, children }: { className?: string; children: ReactNode }): ReactNode {
  return (
    <button type="button" className={className} onClick={() => void load().then((CC) => CC.showPreferences())}>
      {children}
    </button>
  );
}
