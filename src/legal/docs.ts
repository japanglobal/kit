/** Legal page slugs — edge-safe (proxy/middleware route allow-lists import this, not the React module). */
export const LEGAL_DOCS = ["privacy", "terms", "cookies", "tokushoho"] as const;
export type LegalDoc = (typeof LEGAL_DOCS)[number];

/** The vault render's file name per slug (src/content/legal/<lang>/<file>.md). */
export const LEGAL_FILES: Readonly<Record<Exclude<LegalDoc, "cookies">, string>> = {
  privacy: "privacy-policy",
  terms: "terms-and-conditions",
  tokushoho: "tokushoho",
};
