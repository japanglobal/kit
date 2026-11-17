import { describe, expect, it, vi } from "vitest";
import { defineConsent, globToRegExp } from "../src/consent/config.js";
import { applyConsentToPostHog } from "../src/consent/posthog.js";
import { readConsent } from "../src/consent/core.js";
import { COPY } from "../src/i18n/copy.js";
import { cookie, NOW, VENDORS } from "./fixtures.js";

const site = { appName: "ZuCity", lang: "en" as const, links: { privacy: "/{lang}/legal/privacy", cookies: "/{lang}/legal/cookies" }, contact: "hello@zucity.org", vendors: VENDORS };

describe("defineConsent", () => {
  const c = defineConsent(site);
  it("opt-in, only Essentials on (read-only), none pre-enabled", () => {
    expect(c.mode).toBe("opt-in");
    expect(c.categories.necessary).toEqual({ enabled: true, readOnly: true });
    for (const k of ["personalization", "partners"]) expect(c.categories[k]?.enabled).toBe(false);
    expect(Object.keys(c.categories).sort()).toEqual(["necessary", "partners", "personalization"]);
  });
  it("365-day cookie, bottom bar, equal-weight buttons, no cookie wall", () => {
    expect(c.cookie).toMatchObject({ name: "cc_cookie", expiresAfterDays: 365 });
    expect(c.guiOptions?.consentModal).toMatchObject({ layout: "bar", position: "bottom", equalWeightButtons: true });
    expect(c.guiOptions?.preferencesModal?.equalWeightButtons).toBe(true);
    expect(c.disablePageInteraction).toBe(false);
  });
  it("Reject all sits on the first layer; links are localized", () => {
    const ja = c.language.translations.ja as { consentModal: { acceptNecessaryBtn: string; footer: string } };
    expect(ja.consentModal.acceptNecessaryBtn).toBe("すべて拒否");
    expect(ja.consentModal.footer).toContain("/ja/legal/privacy");
  });
  it("withdrawal clears each category's cookies", () => {
    const names = c.categories.personalization?.autoClear?.cookies.map((x) => String(x.name));
    expect(names).toEqual([String(/^ph_.*$/), String(/^_fbp$/), String(/^_fbc$/)]);
    expect(globToRegExp("zc_xp_*").test("zc_xp_hero")).toBe(true);
    expect(globToRegExp("_ga").test("_gax")).toBe(false);
  });
  it("GPC adds the note; revision defaults to 1", () => {
    const g = defineConsent({ ...site, gpc: true }).language.translations.en as { consentModal: { description: string } };
    expect(g.consentModal.description).toContain("Global Privacy Control");
    expect(c.revision).toBe(1);
  });
});

describe("copy", () => {
  it("EN and JA have identical keys, all non-empty", () => {
    expect(Object.keys(COPY.ja).sort()).toEqual(Object.keys(COPY.en).sort());
    for (const lang of ["en", "ja"] as const) for (const v of Object.values(COPY[lang])) expect(v.length).toBeGreaterThan(0);
  });
});

describe("applyConsentToPostHog", () => {
  const ph = (optedOut: boolean) => ({
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    has_opted_out_capturing: vi.fn(() => optedOut),
    set_config: vi.fn(),
    reset: vi.fn(),
    stopSessionRecording: vi.fn(),
  });
  it("grant opts in and persists", () => {
    const p = ph(true);
    applyConsentToPostHog(p, readConsent(cookie(), { now: NOW }));
    expect(p.opt_in_capturing).toHaveBeenCalled();
    expect(p.set_config).toHaveBeenCalledWith({ persistence: "localStorage+cookie" });
  });
  it("withdraw opts out, resets, memory only", () => {
    const p = ph(false);
    applyConsentToPostHog(p, readConsent(cookie({ categories: ["necessary"] }), { now: NOW }));
    expect(p.opt_out_capturing).toHaveBeenCalled();
    expect(p.reset).toHaveBeenCalled();
    expect(p.stopSessionRecording).toHaveBeenCalled();
    expect(p.set_config).toHaveBeenCalledWith({ persistence: "memory" });
  });
  it("already opted out + no consent: untouched", () => {
    const p = ph(true);
    applyConsentToPostHog(p, null);
    expect(p.opt_out_capturing).not.toHaveBeenCalled();
  });
});

describe("initWhenConsented", () => {
  it("waits for a grant, then inits exactly once; untouched when un-started", async () => {
    const { initWhenConsented } = await import("../src/consent/posthog.js");
    const listeners: Record<string, (() => void)[]> = {};
    let cookieStr = "";
    vi.stubGlobal("window", {
      addEventListener: (e: string, f: () => void) => (listeners[e] ??= []).push(f),
      removeEventListener: (e: string, f: () => void) => (listeners[e] = (listeners[e] ?? []).filter((x) => x !== f)),
    });
    vi.stubGlobal("document", { get cookie() { return cookieStr; } });
    const init = vi.fn();
    initWhenConsented(init);
    expect(init).not.toHaveBeenCalled();
    cookieStr = `cc_cookie=${cookie({ categories: ["necessary"], expirationTime: Date.now() + 1e10 })}`;
    listeners["cc:onConsent"]?.forEach((f) => f());
    expect(init).not.toHaveBeenCalled();
    cookieStr = `cc_cookie=${cookie({ expirationTime: Date.now() + 1e10 })}`;
    listeners["cc:onChange"]?.forEach((f) => f());
    listeners["cc:onChange"]?.forEach((f) => f());
    expect(init).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    const p = { __loaded: false, opt_in_capturing: vi.fn(), opt_out_capturing: vi.fn(), has_opted_out_capturing: () => false, set_config: vi.fn(), reset: vi.fn() };
    applyConsentToPostHog(p, null);
    expect(p.opt_out_capturing).not.toHaveBeenCalled();
  });
});

describe("countryName + LEGAL_DOCS", () => {
  it("translates countries for JA, passes unknowns", async () => {
    const { countryName } = await import("../src/i18n/copy.js");
    expect(countryName("United States", "ja")).toBe("米国");
    expect(countryName("Japan, United States", "ja")).toBe("日本、米国");
    expect(countryName("Narnia", "ja")).toBe("Narnia");
    expect(countryName(null, "en")).toBe("—");
    const { LEGAL_DOCS } = await import("../src/legal/docs.js");
    expect(LEGAL_DOCS).toEqual(["privacy", "terms", "cookies", "tokushoho"]);
  });
});
