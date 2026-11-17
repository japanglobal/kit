/**
 * Banner, preferences and footer copy, EN + JA, identical keys (a test pins parity).
 * `{app}` and `{contact}` are filled per site. Plain functional UI text — brand/translation seats review.
 */
export type Lang = "en" | "ja";

export interface Copy {
  readonly title: string;
  readonly description: string;
  readonly gpc: string;
  readonly acceptAll: string;
  readonly rejectAll: string;
  readonly customize: string;
  readonly prefsTitle: string;
  readonly save: string;
  readonly close: string;
  readonly intro: string;
  readonly necessaryTitle: string;
  readonly necessaryDesc: string;
  readonly personalizationTitle: string;
  readonly personalizationDesc: string;
  readonly partnersTitle: string;
  readonly partnersDesc: string;
  readonly moreTitle: string;
  readonly moreDesc: string;
  readonly colService: string;
  readonly colPurpose: string;
  readonly colCountry: string;
  readonly colCookies: string;
  readonly privacy: string;
  readonly terms: string;
  readonly cookies: string;
  readonly tokushoho: string;
  readonly settings: string;
  readonly legalNav: string;
}

export const COPY: Readonly<Record<Lang, Copy>> = {
  en: {
    title: "Cookies — your choice",
    description:
      "Essential cookies keep {app} working. Only with your OK do we also use cookies to measure and personalize the site (including ads measured with Meta and Google) and share data with our Japanese partners — Japan Global Council, Zaibots and the JGC data platform. Nothing beyond essentials runs until you choose. Change your mind any time in Cookie settings.",
    gpc: "Your browser sends a Global Privacy Control signal: sharing stays off unless you turn it on.",
    acceptAll: "Accept all",
    rejectAll: "Reject all",
    customize: "Customize",
    prefsTitle: "Cookie settings",
    save: "Save choices",
    close: "Close",
    intro: "Choose what {app} may use. Your choice is saved for 12 months.",
    necessaryTitle: "Essentials — always on",
    necessaryDesc: "Sign-in, security, language, payments and remembering this choice. The site cannot work without them.",
    personalizationTitle: "Personalization",
    personalizationDesc:
      "Analytics, A/B tests and session replay that help us improve {app}, and personalized ads measured with Meta and Google (United States).",
    partnersTitle: "Share with Japanese partners",
    partnersDesc:
      "Share your activity with Japan Global Council, Zaibots and the JGC data platform — and with third-party apps and agents you approve in the Zaibots app — so they can offer you connected services. Some are operated in the United States.",
    moreTitle: "More information",
    moreDesc: 'Read our <a href="{privacy}">Privacy policy</a> and <a href="{cookies}">Cookie policy</a>. Questions: {contact}.',
    colService: "Service",
    colPurpose: "Purpose",
    colCountry: "Country",
    colCookies: "Cookies",
    privacy: "Privacy policy",
    terms: "Terms",
    cookies: "Cookie policy",
    tokushoho: "Specified Commercial Transactions Act",
    settings: "Cookie settings",
    legalNav: "Legal",
  },
  ja: {
    title: "Cookieの利用について",
    description:
      "{app}の動作に必要なCookieは常に使用します。同意いただいた場合に限り、サイトの測定・パーソナライズ（Meta・Googleによる広告測定を含む）のためのCookieを使用し、日本のパートナー（Japan Global Council、Zaibots、JGCデータプラットフォーム）とデータを共有します。選択されるまで、必須以外のCookieは使用しません。設定はいつでも「Cookie設定」から変更できます。",
    gpc: "お使いのブラウザからグローバル・プライバシー・コントロール（GPC）信号を受信しました。ご自身で有効にしない限り、共有はオフのままです。",
    acceptAll: "すべて同意",
    rejectAll: "すべて拒否",
    customize: "カスタマイズ",
    prefsTitle: "Cookie設定",
    save: "選択を保存",
    close: "閉じる",
    intro: "{app}が使用できる項目をお選びください。選択内容は12か月間保存されます。",
    necessaryTitle: "必須（常に有効）",
    necessaryDesc: "ログイン、セキュリティ、言語設定、決済、およびこの選択の保存に使用します。これらがないとサイトは動作しません。",
    personalizationTitle: "パーソナライズ",
    personalizationDesc:
      "{app}の改善のためのアクセス解析・A/Bテスト・セッションリプレイ、およびMeta・Google（米国）によるパーソナライズ広告の測定に使用します。",
    partnersTitle: "日本のパートナーとの共有",
    partnersDesc:
      "Japan Global Council、Zaibots、JGCデータプラットフォーム、およびZaibotsアプリでお客様が承認した第三者のアプリ・エージェントとお客様の利用情報を共有し、連携したサービスを提供します。一部は米国で運営されています。",
    moreTitle: "詳しくは",
    moreDesc: '<a href="{privacy}">プライバシーポリシー</a>および<a href="{cookies}">Cookieポリシー</a>をご覧ください。お問い合わせ：{contact}',
    colService: "サービス",
    colPurpose: "利用目的",
    colCountry: "所在国",
    colCookies: "Cookie",
    privacy: "プライバシーポリシー",
    terms: "利用規約",
    cookies: "Cookieポリシー",
    tokushoho: "特定商取引法に基づく表記",
    settings: "Cookie設定",
    legalNav: "法的情報",
  },
};

export const fill = (s: string, vars: Readonly<Record<string, string>>): string =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

const COUNTRY_JA: Readonly<Record<string, string>> = {
  Japan: "日本",
  "United States": "米国",
  "European Union": "欧州連合",
  Ireland: "アイルランド",
  Germany: "ドイツ",
  Singapore: "シンガポール",
  "United Kingdom": "英国",
};

/** Vendor country in the page language; unknown names pass through. */
export const countryName = (country: string | null | undefined, lang: Lang): string =>
  !country ? "—" : lang === "ja" ? country.split(/,\s*/).map((c) => COUNTRY_JA[c] ?? c).join("、") : country;
