/**
 * defineConsent — the JGC policy as a vanilla-cookieconsent config. Opt-in, three categories (only
 * Essentials on, read-only), bottom bar, equal-weight Accept/Reject/Customize, 365-day cookie, a
 * revision bump re-prompts. Vendor rows come from the vault registry (`legal_render.py consent <app>`).
 */
import type * as CC from "vanilla-cookieconsent";
import { CONSENT_COOKIE, ONE_YEAR_DAYS, type Category } from "./core.js";
import { COPY, countryName, fill, type Lang } from "../i18n/copy.js";
import { kitEnv, missing } from "../env.js";

export interface Vendor {
  readonly name: string;
  readonly purpose: string;
  readonly purpose_ja?: string;
  readonly country?: string | null;
  /** Cookie name patterns; `*` = any run of characters. Cleared on withdrawal. */
  readonly cookies?: readonly string[];
}
export type VendorMap = Readonly<Record<Category, readonly Vendor[]>>;

export interface ConsentSiteConfig {
  readonly appName: string;
  readonly lang: Lang;
  /** Policy revision; bump when the policy or vendor list changes materially (re-prompts everyone).
   *  Default: NEXT_PUBLIC_JGC_CONSENT_REVISION (1 when unset). */
  readonly revision?: number;
  /** Paths with `{lang}`, e.g. "/{lang}/legal/privacy". */
  readonly links: { readonly privacy: string; readonly cookies: string };
  readonly contact: string;
  readonly vendors: VendorMap;
  /** navigator.globalPrivacyControl — adds the GPC note. Nothing is pre-selected either way. */
  readonly gpc?: boolean;
  readonly callbacks?: Pick<CC.CookieConsentConfig, "onFirstConsent" | "onConsent" | "onChange">;
}

/** What a site passes to <Consent/>: `lang` + `vendors`; the rest defaults from the env (props win). */
export type ConsentOptions = Pick<ConsentSiteConfig, "lang" | "vendors"> &
  Partial<Pick<ConsentSiteConfig, "appName" | "contact" | "revision" | "links">>;

/**
 * Fill a site's options from the env: appName ← NEXT_PUBLIC_JGC_APP_NAME, contact ←
 * NEXT_PUBLIC_JGC_CONTACT_EMAIL, revision ← NEXT_PUBLIC_JGC_CONSENT_REVISION, links ←
 * NEXT_PUBLIC_JGC_LEGAL_PATH. Null (banner off, one dev error naming the variable) when the name
 * or contact is missing.
 */
export function resolveConsentConfig(o: ConsentOptions): Omit<ConsentSiteConfig, "gpc" | "callbacks"> | null {
  const env = kitEnv();
  const appName = o.appName ?? env.appName;
  const contact = o.contact ?? env.contactEmail;
  if (!appName) return missing("NEXT_PUBLIC_JGC_APP_NAME", "The cookie banner");
  if (!contact) return missing("NEXT_PUBLIC_JGC_CONTACT_EMAIL", "The cookie banner");
  const doc = (d: string): string => env.legalPath.replace("{doc}", d);
  return {
    ...o,
    appName,
    contact,
    revision: o.revision ?? env.consentRevision,
    links: o.links ?? { privacy: doc("privacy"), cookies: doc("cookies") },
  };
}

const CATEGORIES: readonly Category[] = ["necessary", "personalization", "partners"];

export const globToRegExp = (glob: string): RegExp =>
  new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);

function translation(c: ConsentSiteConfig, lang: Lang): CC.Translation {
  const t = COPY[lang];
  const vars = {
    app: c.appName,
    contact: c.contact,
    privacy: c.links.privacy.replace("{lang}", lang),
    cookies: c.links.cookies.replace("{lang}", lang),
  };
  const table = (cat: Category): CC.CookieTable | undefined =>
    c.vendors[cat].length === 0
      ? undefined
      : {
          headers: { name: t.colService, purpose: t.colPurpose, country: t.colCountry, cookies: t.colCookies },
          body: c.vendors[cat].map((v) => ({
            name: v.name,
            purpose: lang === "ja" ? (v.purpose_ja ?? v.purpose) : v.purpose,
            country: countryName(v.country, lang),
            cookies: (v.cookies ?? []).join(", ") || "—",
          })),
        };
  const section = (cat: Category, title: string, desc: string): CC.Section => ({
    title: fill(title, vars),
    description: fill(desc, vars),
    linkedCategory: cat,
    cookieTable: table(cat),
  });
  return {
    consentModal: {
      title: t.title,
      description: fill(t.description, vars) + (c.gpc ? ` ${t.gpc}` : ""),
      acceptAllBtn: t.acceptAll,
      acceptNecessaryBtn: t.rejectAll,
      showPreferencesBtn: t.customize,
      footer: `<a href="${vars.privacy}">${t.privacy}</a> <a href="${vars.cookies}">${t.cookies}</a>`,
    },
    preferencesModal: {
      title: t.prefsTitle,
      acceptAllBtn: t.acceptAll,
      acceptNecessaryBtn: t.rejectAll,
      savePreferencesBtn: t.save,
      closeIconLabel: t.close,
      sections: [
        { description: fill(t.intro, vars) },
        section("necessary", t.necessaryTitle, t.necessaryDesc),
        section("personalization", t.personalizationTitle, t.personalizationDesc),
        section("partners", t.partnersTitle, t.partnersDesc),
        { title: t.moreTitle, description: fill(t.moreDesc, vars) },
      ],
    },
  };
}

export function defineConsent(c: ConsentSiteConfig): CC.CookieConsentConfig {
  // reloadPage: a withdrawn category's scripts (gtag, posthog) are already running and would rewrite the
  // cookies just cleared — reload so nothing non-essential survives the withdrawal.
  const clear = (cat: Category): CC.AutoClear => ({
    cookies: c.vendors[cat].flatMap((v) => (v.cookies ?? []).map((name) => ({ name: globToRegExp(name) }))),
    reloadPage: true,
  });
  return {
    mode: "opt-in",
    autoShow: true,
    revision: c.revision ?? kitEnv().consentRevision,
    hideFromBots: true,
    disablePageInteraction: false,
    cookie: { name: CONSENT_COOKIE, expiresAfterDays: ONE_YEAR_DAYS, sameSite: "Lax" },
    guiOptions: {
      consentModal: { layout: "bar", position: "bottom", equalWeightButtons: true, flipButtons: false },
      preferencesModal: { layout: "box", equalWeightButtons: true, flipButtons: false },
    },
    categories: Object.fromEntries(
      CATEGORIES.map((cat) => [
        cat,
        cat === "necessary" ? { enabled: true, readOnly: true } : { enabled: false, readOnly: false, autoClear: clear(cat) },
      ]),
    ),
    language: { default: c.lang, translations: { en: translation(c, "en"), ja: translation(c, "ja") } },
    ...c.callbacks,
  };
}
