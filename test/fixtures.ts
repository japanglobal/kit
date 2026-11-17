import type { VendorMap } from "../src/consent/config.js";

export const NOW = Date.UTC(2026, 10, 17);
export const DAY = 86_400_000;

export const cookie = (o: Partial<{ categories: unknown; revision: unknown; consentId: unknown; expirationTime: unknown }> = {}): string =>
  encodeURIComponent(
    JSON.stringify({
      categories: ["necessary", "personalization"],
      revision: 1,
      consentId: "0b6f6c64-2b0e-4b8e-9a51-6b8c4c9a1f00",
      expirationTime: NOW + 365 * DAY,
      lastConsentTimestamp: new Date(NOW).toISOString(),
      ...o,
    }),
  );

export const VENDORS: VendorMap = {
  necessary: [{ name: "Privy", purpose: "Sign-in", purpose_ja: "ログイン", country: "United States", cookies: ["privy-token"] }],
  personalization: [
    { name: "PostHog", purpose: "Analytics", purpose_ja: "アクセス解析", country: "United States", cookies: ["ph_*"] },
    { name: "Meta", purpose: "Ads measurement", country: "United States", cookies: ["_fbp", "_fbc"] },
  ],
  partners: [{ name: "Zaibots", purpose: "Connected services", country: "Japan", cookies: [] }],
};

/** Deterministic pseudo-random event names (seeded LCG) for fuzzing. */
export function names(n: number, seed = 7): string[] {
  let x = seed;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) % 2 ** 31;
    out.push(`ev_${x.toString(36)}`);
  }
  return out;
}
