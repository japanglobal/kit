// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const run = vi.fn(async (_config: unknown) => undefined);
vi.mock("vanilla-cookieconsent", () => ({ run, showPreferences: vi.fn(), setLanguage: vi.fn(async () => true), eraseCookies: vi.fn() }));

import { kitEnv, resetMissingReports, type KitEnvVar } from "../src/env.js";
import { readConsent } from "../src/consent/core.js";
import { defineConsent, resolveConsentConfig } from "../src/consent/config.js";
import { createTrackRoute } from "../src/consent/server.js";
import { Consent } from "../src/consent/react.js";
import { GoogleTagManager } from "../src/gtm/react.js";
import { LegalLinks } from "../src/legal/react.js";
import { createClientTracker, createServerTracker } from "../src/track/presets.js";
import type { TrackEvent } from "../src/track/types.js";
import { cookie, NOW, VENDORS } from "./fixtures.js";

const ALL: readonly KitEnvVar[] = [
  "NEXT_PUBLIC_JGC_APP_ID",
  "NEXT_PUBLIC_JGC_APP_NAME",
  "NEXT_PUBLIC_JGC_CONTACT_EMAIL",
  "NEXT_PUBLIC_JGC_CONSENT_REVISION",
  "NEXT_PUBLIC_JGC_LEGAL_PATH",
  "NEXT_PUBLIC_JGC_TRACK_URL",
  "NEXT_PUBLIC_JGC_SELLS",
  "NEXT_PUBLIC_GTM_ID",
  "NEXT_PUBLIC_META_PIXEL_ID",
];
const SITE: Partial<Record<KitEnvVar, string>> = {
  NEXT_PUBLIC_JGC_APP_ID: "zucity",
  NEXT_PUBLIC_JGC_APP_NAME: "ZuCity",
  NEXT_PUBLIC_JGC_CONTACT_EMAIL: "hello@zucity.org",
  NEXT_PUBLIC_JGC_CONSENT_REVISION: "3",
  NEXT_PUBLIC_JGC_LEGAL_PATH: "/legal/{doc}?hl={lang}",
  NEXT_PUBLIC_JGC_TRACK_URL: "/t",
  NEXT_PUBLIC_JGC_SELLS: "true",
  NEXT_PUBLIC_GTM_ID: "GTM-5V6ZLSZ5",
  NEXT_PUBLIC_META_PIXEL_ID: "123456789012345",
};
const setEnv = (vars: Partial<Record<KitEnvVar, string>>): void => {
  for (const k of ALL) vi.stubEnv(k, vars[k] ?? "");
};
let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  setEnv({});
  resetMissingReports();
  run.mockClear();
  errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  errors.mockRestore();
  document.cookie = "cc_cookie=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("kitEnv — parsing", () => {
  it("unset: required values null, defaults applied", () => {
    expect(kitEnv()).toEqual({
      appId: null,
      appName: null,
      contactEmail: null,
      consentRevision: 1,
      legalPath: "/{lang}/legal/{doc}",
      trackUrl: "/api/track",
      sells: false,
      gtmId: null,
      metaPixelId: null,
    });
  });

  it("valid: every variable read (trimmed)", () => {
    setEnv({ ...SITE, NEXT_PUBLIC_JGC_APP_ID: "  zucity  " });
    expect(kitEnv()).toEqual({
      appId: "zucity",
      appName: "ZuCity",
      contactEmail: "hello@zucity.org",
      consentRevision: 3,
      legalPath: "/legal/{doc}?hl={lang}",
      trackUrl: "/t",
      sells: true,
      gtmId: "GTM-5V6ZLSZ5",
      metaPixelId: "123456789012345",
    });
  });

  it.each<[KitEnvVar, string, keyof ReturnType<typeof kitEnv>, unknown]>([
    ["NEXT_PUBLIC_JGC_APP_ID", "ZuCity", "appId", null],
    ["NEXT_PUBLIC_JGC_APP_ID", "zu city", "appId", null],
    ["NEXT_PUBLIC_JGC_APP_ID", "-x", "appId", null],
    ["NEXT_PUBLIC_JGC_APP_NAME", "<script>", "appName", null],
    ["NEXT_PUBLIC_JGC_APP_NAME", "x".repeat(65), "appName", null],
    ["NEXT_PUBLIC_JGC_CONTACT_EMAIL", "hello", "contactEmail", null],
    ["NEXT_PUBLIC_JGC_CONTACT_EMAIL", "a@b", "contactEmail", null],
    ["NEXT_PUBLIC_JGC_CONTACT_EMAIL", "a@b.c\"><x", "contactEmail", null],
    ["NEXT_PUBLIC_JGC_CONSENT_REVISION", "0", "consentRevision", 1],
    ["NEXT_PUBLIC_JGC_CONSENT_REVISION", "-2", "consentRevision", 1],
    ["NEXT_PUBLIC_JGC_CONSENT_REVISION", "1.5", "consentRevision", 1],
    ["NEXT_PUBLIC_JGC_CONSENT_REVISION", "2e3", "consentRevision", 1],
    ["NEXT_PUBLIC_JGC_CONSENT_REVISION", "007", "consentRevision", 1],
    ["NEXT_PUBLIC_JGC_CONSENT_REVISION", "abc", "consentRevision", 1],
    ["NEXT_PUBLIC_JGC_CONSENT_REVISION", "12", "consentRevision", 12],
    ["NEXT_PUBLIC_JGC_LEGAL_PATH", "/legal/privacy", "legalPath", "/{lang}/legal/{doc}"],
    ["NEXT_PUBLIC_JGC_LEGAL_PATH", "//evil.test/{doc}", "legalPath", "/{lang}/legal/{doc}"],
    ["NEXT_PUBLIC_JGC_LEGAL_PATH", "https://x.test/{doc}", "legalPath", "/{lang}/legal/{doc}"],
    ["NEXT_PUBLIC_JGC_LEGAL_PATH", "/{doc}\"><x", "legalPath", "/{lang}/legal/{doc}"],
    ["NEXT_PUBLIC_JGC_TRACK_URL", "//evil.test/t", "trackUrl", "/api/track"],
    ["NEXT_PUBLIC_JGC_TRACK_URL", "https://evil.test/t", "trackUrl", "/api/track"],
    ["NEXT_PUBLIC_JGC_TRACK_URL", "api/track", "trackUrl", "/api/track"],
    ["NEXT_PUBLIC_JGC_SELLS", "1", "sells", false],
    ["NEXT_PUBLIC_JGC_SELLS", "yes", "sells", false],
    ["NEXT_PUBLIC_JGC_SELLS", "false", "sells", false],
    ["NEXT_PUBLIC_GTM_ID", "gtm-abc123", "gtmId", null],
    ["NEXT_PUBLIC_GTM_ID", "GTM-", "gtmId", null],
    ["NEXT_PUBLIC_GTM_ID", "G-ABC123", "gtmId", null],
    ["NEXT_PUBLIC_GTM_ID", "GTM-AB/../x.js", "gtmId", null],
    ["NEXT_PUBLIC_GTM_ID", "GTM-ABC 123", "gtmId", null],
    ["NEXT_PUBLIC_GTM_ID", "GTM-ABC123", "gtmId", "GTM-ABC123"],
    ["NEXT_PUBLIC_META_PIXEL_ID", "off", "metaPixelId", null], // the documented off switch
    ["NEXT_PUBLIC_META_PIXEL_ID", "12345", "metaPixelId", null],
    ["NEXT_PUBLIC_META_PIXEL_ID", "1".repeat(21), "metaPixelId", null],
    ["NEXT_PUBLIC_META_PIXEL_ID", "12345678x", "metaPixelId", null],
    ["NEXT_PUBLIC_META_PIXEL_ID", "123456789');alert(1)//", "metaPixelId", null],
    ["NEXT_PUBLIC_META_PIXEL_ID", "123456", "metaPixelId", "123456"],
    ["NEXT_PUBLIC_META_PIXEL_ID", "123456789012345", "metaPixelId", "123456789012345"],
  ])("%s=%j → %s %j (invalid = unset, never a throw)", (name, value, key, want) => {
    setEnv({ [name]: value });
    expect(kitEnv()[key]).toEqual(want);
  });
});

describe("revision default reaches every reader", () => {
  it("readConsent / consented use NEXT_PUBLIC_JGC_CONSENT_REVISION; an explicit revision wins", () => {
    expect(readConsent(cookie({ revision: 1 }), { now: NOW })).not.toBeNull();
    expect(readConsent(cookie({ revision: 2 }), { now: NOW })).toBeNull();
    setEnv({ NEXT_PUBLIC_JGC_CONSENT_REVISION: "2" });
    expect(readConsent(cookie({ revision: 1 }), { now: NOW })).toBeNull();
    expect(readConsent(cookie({ revision: 2 }), { now: NOW })).not.toBeNull();
    expect(readConsent(cookie({ revision: 1 }), { now: NOW, revision: 1 })).not.toBeNull();
    expect(defineConsent({ appName: "Z", lang: "en", links: { privacy: "/p", cookies: "/c" }, contact: "a@b.co", vendors: VENDORS }).revision).toBe(2);
  });
});

describe("props override env; missing required ⇒ no-op + one dev error", () => {
  it("<Consent/> with only lang + vendors runs from the env", async () => {
    setEnv(SITE);
    render(<Consent config={{ lang: "en", vendors: VENDORS }} />);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const cfg = run.mock.calls[0]![0] as { revision: number; language: { translations: { en: { consentModal: { description: string; footer: string } } } } };
    expect(cfg.revision).toBe(3);
    expect(cfg.language.translations.en.consentModal.description).toContain("ZuCity");
    expect(cfg.language.translations.en.consentModal.footer).toContain('href="/legal/privacy?hl=en"');
  });

  it("props beat the env", () => {
    setEnv(SITE);
    const c = resolveConsentConfig({ lang: "ja", vendors: VENDORS, appName: "Other", contact: "x@y.co", revision: 9, links: { privacy: "/a", cookies: "/b" } });
    expect(c).toMatchObject({ appName: "Other", contact: "x@y.co", revision: 9, links: { privacy: "/a", cookies: "/b" } });
  });

  it("<Consent/> without a name or contact: no banner, one console.error naming the variable", async () => {
    setEnv({ NEXT_PUBLIC_JGC_CONTACT_EMAIL: "hello@zucity.org" });
    render(<Consent config={{ lang: "en", vendors: VENDORS }} />);
    render(<Consent config={{ lang: "en", vendors: VENDORS }} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(run).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0]![0])).toContain("NEXT_PUBLIC_JGC_APP_NAME");
    expect(resolveConsentConfig({ lang: "en", vendors: VENDORS, appName: "Z" })).not.toBeNull();
    setEnv({ NEXT_PUBLIC_JGC_APP_NAME: "Z" });
    expect(resolveConsentConfig({ lang: "en", vendors: VENDORS })).toBeNull();
    expect(String(errors.mock.calls[1]![0])).toContain("NEXT_PUBLIC_JGC_CONTACT_EMAIL");
  });

  it("<GoogleTagManager/> takes NEXT_PUBLIC_GTM_ID; unset or invalid renders nothing and names the variable", () => {
    document.cookie = `cc_cookie=${cookie({ expirationTime: Date.now() + 1e10 })}; path=/`;
    setEnv({ NEXT_PUBLIC_GTM_ID: "GTM-ENV1" });
    render(<GoogleTagManager />);
    expect(document.getElementById("gtm-GTM-ENV1")).not.toBeNull();
    render(<GoogleTagManager id="GTM-PROP1" />);
    expect(document.getElementById("gtm-GTM-PROP1")).not.toBeNull();
    document.querySelectorAll("script[id^=gtm-]").forEach((s) => s.remove());
    setEnv({ NEXT_PUBLIC_GTM_ID: "evil.js" });
    render(<GoogleTagManager />);
    render(<GoogleTagManager id={null} />);
    expect(document.querySelectorAll("script[id^=gtm-]").length).toBe(0);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0]![0])).toContain("NEXT_PUBLIC_GTM_ID");
  });

  it("<LegalLinks/>: path + 特商法 from the env; props win", () => {
    setEnv(SITE);
    render(<LegalLinks lang="en" />);
    expect(screen.getByText("Privacy policy").getAttribute("href")).toBe("/legal/privacy?hl=en");
    expect(screen.getByText("Specified Commercial Transactions Act")).toBeTruthy();
    render(<LegalLinks lang="ja" href="/{lang}/l/{doc}" tokushoho={false} className="b" />);
    expect(document.querySelector(".b a")?.getAttribute("href")).toBe("/ja/l/privacy");
    expect(document.querySelectorAll(".b a").length).toBe(3);
  });

  it("createClientTracker: app id + beacon url from the env; prop wins; none ⇒ every event dropped", () => {
    const beacon = vi.fn((_url: string, _body: Blob) => true);
    vi.stubGlobal("navigator", { sendBeacon: beacon });
    const layer: unknown[] = [];
    const granted = () => readConsent(cookie(), { now: NOW, revision: 1 });
    setEnv(SITE);
    const opts = { posthog: null, dataLayer: { get: () => layer, grant: () => true } };
    createClientTracker<TrackEvent>({ ...opts, consent: granted })({ name: "view_item" });
    createClientTracker<TrackEvent>({ ...opts, consent: granted, appId: "prop" })({ name: "view_item" });
    expect(layer.map((a) => Array.from(a as ArrayLike<unknown>))).toEqual([
      ["event", "view_item", { app_id: "zucity" }],
      ["event", "view_item", { app_id: "prop" }],
    ]);
    createClientTracker<TrackEvent>({ posthog: null, consent: () => null })({ name: "login" });
    expect(beacon.mock.calls[0]![0]).toBe("/t");
    setEnv({});
    const ph = { capture: vi.fn() };
    expect(createClientTracker<TrackEvent>({ posthog: ph, consent: granted })({ name: "login" })).toEqual([{ skipped: "no_app_id" }]);
    expect(ph.capture).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0]![0])).toContain("NEXT_PUBLIC_JGC_APP_ID");
    vi.unstubAllGlobals();
  });

  it("createServerTracker stamps app_id on every leg; none ⇒ dropped", () => {
    setEnv(SITE);
    const ph = { capture: vi.fn() };
    const ga4 = vi.fn((_e: TrackEvent) => true);
    createServerTracker<TrackEvent>({ posthog: ph, distinctId: () => "m", consent: () => readConsent(cookie({ revision: 3 }), { now: NOW }), ads: { ga4 } })({ name: "purchase" });
    expect(ph.capture.mock.calls[0]![0].properties).toEqual({ app_id: "zucity" });
    expect(ga4.mock.calls[0]![0].props).toEqual({ app_id: "zucity" });
    setEnv({});
    const ph2 = { capture: vi.fn() };
    expect(createServerTracker<TrackEvent>({ posthog: ph2, distinctId: () => "m", consent: () => null })({ name: "purchase" })).toEqual([{ skipped: "no_app_id" }]);
    expect(ph2.capture).not.toHaveBeenCalled();
  });

  it("createTrackRoute: app id + revision from the env; none ⇒ 204, nothing captured", async () => {
    const req = (rev: number) =>
      new Request("https://x.test/api/track", {
        method: "POST",
        body: JSON.stringify({ name: "consent_updated" }),
        headers: { cookie: `cc_cookie=${cookie({ revision: rev, expirationTime: Date.now() + 1e10 })}` },
      });
    setEnv(SITE);
    const capture = vi.fn();
    const POST = createTrackRoute({ posthog: { capture } });
    expect((await POST(req(1))).status).toBe(400);
    expect((await POST(req(3))).status).toBe(204);
    expect(capture.mock.calls[0]![0].properties).toMatchObject({ app_id: "zucity", v: 3 });
    setEnv({ NEXT_PUBLIC_JGC_CONSENT_REVISION: "3" });
    const capture2 = vi.fn();
    expect((await createTrackRoute({ posthog: { capture: capture2 } })(req(3))).status).toBe(204);
    expect(capture2).not.toHaveBeenCalled();
    expect(String(errors.mock.calls[0]![0])).toContain("NEXT_PUBLIC_JGC_APP_ID");
  });
});

describe("env law", () => {
  it("src/env.ts is the only module that reads process.env", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((f) => (f.isDirectory() ? walk(join(d, f.name)) : [join(d, f.name)]));
    const readers = walk("src").filter((f) => readFileSync(f, "utf8").includes("process.env"));
    expect(readers).toEqual([join("src", "env.ts")]);
  });
});
