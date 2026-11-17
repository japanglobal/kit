"use client";
/**
 * <Consent/> mounts the banner once per page load; useConsent() / <ConsentGate/> read the live decision;
 * <CookieSettingsButton/> reopens the preferences (withdrawal as easy as consent).
 */
import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { consentFromDocument, cookieValue, readConsent, type Consent, type OptionalCategory, type ReadOptions } from "./core.js";
import { defineConsent, type ConsentSiteConfig } from "./config.js";
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
        if (posthog) applyConsentToPostHog(posthog, consentFromDocument(read));
      };
      void CC.run(
        defineConsent({
          ...config,
          gpc,
          callbacks: {
            onConsent: apply,
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
