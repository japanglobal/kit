/**
 * Legal pages + footer links. Markdown is rendered by `legal_render.py sync` from the vault registry and
 * committed in each site (src/content/legal/<lang>/<doc>.md); these components only display it.
 */
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";
import { COPY, countryName, type Lang } from "../i18n/copy.js";
import type { Category } from "../consent/core.js";
import type { VendorMap } from "../consent/config.js";
import { CookieSettingsButton } from "../consent/react.js";
import { kitEnv } from "../env.js";

import type { LegalDoc } from "./docs.js";
export { LEGAL_DOCS, LEGAL_FILES, type LegalDoc } from "./docs.js";

export function LegalDocument({ markdown, className }: { markdown: string; className?: string }): ReactNode {
  return (
    <article className={className}>
      <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
    </article>
  );
}

export interface LegalLinksProps {
  readonly lang: Lang;
  /** Path with `{lang}` and `{doc}`. Default: NEXT_PUBLIC_JGC_LEGAL_PATH ("/{lang}/legal/{doc}"). */
  readonly href?: string;
  /** Sites that sell show the 特商法 link. Default: NEXT_PUBLIC_JGC_SELLS === "true". */
  readonly tokushoho?: boolean;
  readonly className?: string;
  readonly linkClassName?: string;
  /** The site's Link component (next-intl / next/link); default <a>. */
  readonly Link?: (p: { href: string; className?: string; children: ReactNode }) => ReactNode;
}

export function LegalLinks({ lang, href, tokushoho, className, linkClassName, Link }: LegalLinksProps): ReactNode {
  const env = kitEnv();
  const path = href ?? env.legalPath;
  const sells = tokushoho ?? env.sells;
  const t = COPY[lang];
  const docs: readonly (readonly [LegalDoc, string])[] = [
    ["privacy", t.privacy],
    ["terms", t.terms],
    ["cookies", t.cookies],
    ...(sells ? [["tokushoho", t.tokushoho] as const] : []),
  ];
  const A = Link ?? ((p: { href: string; className?: string; children: ReactNode }) => <a {...p} />);
  return (
    <nav aria-label={t.legalNav} className={className}>
      {docs.map(([doc, text]) => (
        <A key={doc} href={path.replace("{lang}", lang).replace("{doc}", doc)} className={linkClassName}>
          {text}
        </A>
      ))}
      <CookieSettingsButton className={linkClassName}>{t.settings}</CookieSettingsButton>
    </nav>
  );
}

const TITLES: Readonly<Record<Category, "necessaryTitle" | "personalizationTitle" | "partnersTitle">> = {
  necessary: "necessaryTitle",
  personalization: "personalizationTitle",
  partners: "partnersTitle",
};

/** The cookie page body: one table per category, from the same vendor rows the banner shows. */
export function CookieTable({ lang, vendors, className }: { lang: Lang; vendors: VendorMap; className?: string }): ReactNode {
  const t = COPY[lang];
  return (
    <div className={className}>
      {(Object.keys(TITLES) as Category[]).map((cat) => (
        <section key={cat}>
          <h2>{t[TITLES[cat]]}</h2>
          <table>
            <thead>
              <tr>
                <th>{t.colService}</th>
                <th>{t.colPurpose}</th>
                <th>{t.colCountry}</th>
                <th>{t.colCookies}</th>
              </tr>
            </thead>
            <tbody>
              {vendors[cat].map((v) => (
                <tr key={v.name}>
                  <td>{v.name}</td>
                  <td>{lang === "ja" ? (v.purpose_ja ?? v.purpose) : v.purpose}</td>
                  <td>{countryName(v.country, lang)}</td>
                  <td>{(v.cookies ?? []).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <CookieSettingsButton>{t.settings}</CookieSettingsButton>
    </div>
  );
}
