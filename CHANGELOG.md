# Changelog

## 2.1.0 — 2026-11-18

- `@japanglobal/kit/security`: `withSecurity`, `securityHeaders`, `buildCsp`, presets (`gtm`, `ga4`, `googleAds`,
  `metaPixel`, `posthog`, `privy()`, `stripe`, `turnstile`), `checkSecurityHeaders`, `parseCsp`, `origin`.
- `createTrackRoute`: per-IP throttle (120 / 60 s → 429 + Retry-After) and 8 KiB body cap (413); `limit`, `maxBodyBytes`.
- `jgc-audit` bin + `auditFindings`: prod audit gate with a dated, reasoned GHSA allowlist (`.audit-allow.json`).
- `firewall/track-rate-limit.json`: Vercel WAF rule for `vercel firewall rules add --json`.
- Cloudflare origin lock: `firewall/cloudflare-ips.json` + generated `origin-lock-cloudflare-ips.json`,
  `origin-lock-header.json`, `scripts/cloudflare-firewall.mjs` (`--check` weekly), `jgc-origin-check` bin,
  `cloudflareClientIp` (trusts `cf-connecting-ip` only with `JGC_ORIGIN_KEY`).
- `checkSecurityHeaders` also catches host wildcards (`https://*`, `*.com`), keyword case (`'UNSAFE-EVAL'`),
  scheme-wide `base-uri` / `form-action` / `script-src-attr`.
- `prepare` builds `dist/`, so a site can pin a git commit before a release is published.

## 2.0.0 — 2026-11-18

Breaking: the kit ships no Meta code. The browser loads only PostHog + GTM; Meta runs as the GTM container's
Meta Pixel tag, GA4 as its Google tag (every kit event via gtag commands — never add a GA4 Event tag).

Removed exports:
- `@japanglobal/kit/meta` (`metaPixelSink`, `META_STANDARD_EVENTS`, `installMetaPixel`, `fbq`, `FBEVENTS_URL`, `Fbq`)
- `@japanglobal/kit/meta/react` (`<MetaPixel/>`)
- `createClientTracker({ meta })` — the `meta` leg
- `NEXT_PUBLIC_META_PIXEL_ID`, `kitEnv().metaPixelId`, `META_PIXEL_ID_RE` (`@japanglobal/kit/env`)

Migrate: drop `<MetaPixel/>`, the `meta:` tracker option and the env var; keep `<GoogleTagManager/>`.

## 1.1.1

Meta Pixel off switch (`NEXT_PUBLIC_META_PIXEL_ID=off`); fbevents.js URL pinned in tests.

## 1.1.0

Zero-config GA4: gtag `event` commands, `setUserId`, `<MetaPixel/>`.
