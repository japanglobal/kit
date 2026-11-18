# Changelog

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
