# @japanglobal/kit

Shared code for Japan Global Council websites (zucity.org, japanglobal.org, zaibots.com).
MIT. One package, subpath exports; a new shared module is a new folder, not a new package.

| Import | What |
|---|---|
| `@japanglobal/kit/consent` | `readConsent`, `consentFromHeader`, `defineConsent`, `posthogInitOptions`, `applyConsentToPostHog` — edge-safe |
| `@japanglobal/kit/consent/react` | `<Consent/>` (bottom-bar banner), `useConsent`, `<ConsentGate/>`, `<CookieSettingsButton/>` |
| `@japanglobal/kit/consent/server` | `createTrackRoute` — `POST /api/track` for mandatory events without consent |
| `@japanglobal/kit/track` | the tracking chain: sinks + `gate` / `map` / `either` / `fanOut` / `label` / `safe` / `pipe`, `consented()`, presets |
| `@japanglobal/kit/gtm/react` | `<GoogleTagManager/>` — loads the GTM container only while Personalization is granted |
| `@japanglobal/kit/gtm` | `dataLayer()`, `gtag()` (gtag commands as `arguments`), `setUserId()` (consent-gated GA4 `user_id`) |
| `@japanglobal/kit/meta/react` | `<MetaPixel/>` — installs the Meta Pixel only while Personalization is granted |
| `@japanglobal/kit/meta` | `metaPixelSink`, `META_STANDARD_EVENTS` (canonical → Meta standard event), `installMetaPixel`, `fbq()` |
| `@japanglobal/kit/legal` | `<LegalDocument/>`, `<LegalLinks/>`, `<CookieTable/>` |
| `@japanglobal/kit/legal/docs` | `LEGAL_DOCS`, `LEGAL_FILES` — edge-safe, for proxy route allow-lists |
| `@japanglobal/kit/consent.css` | banner styles (vanilla-cookieconsent + JGC overrides; theme with `--cc-*`) |
| `@japanglobal/kit/env` | `kitEnv()` — the validated environment below (edge-safe) |

Banner engine: [vanilla-cookieconsent](https://github.com/orestbida/cookieconsent) 3.3.0 (MIT).

## Environment variables

The kit is configured by environment. `src/env.ts` is the only module that reads `process.env`; every
variable is `NEXT_PUBLIC_*` and referenced literally, so Next inlines it into client bundles at build time
(set it before `next build`). An invalid value counts as unset — the kit never throws over config. A prop
passed explicitly always beats the variable. A required variable missing at runtime turns its feature
off and logs one `console.error` naming the variable (development only).

| Variable | Side | Required? | Default | Used by |
|---|---|---|---|---|
| `NEXT_PUBLIC_JGC_APP_ID` | client + server | **yes, for tracking** (slug `^[a-z0-9][a-z0-9_-]{0,63}$`) | — (tracking off) | `track`: `createClientTracker`, `createServerTracker` (`app_id` stamp) · `consent/server`: `createTrackRoute` |
| `NEXT_PUBLIC_JGC_APP_NAME` | client | **yes, for the banner** (≤64 chars, no `<>&"`) | — (no banner) | `consent/react`: `<Consent/>` banner + preferences copy |
| `NEXT_PUBLIC_JGC_CONTACT_EMAIL` | client | **yes, for the banner** | — (no banner) | `consent/react`: `<Consent/>` privacy contact |
| `NEXT_PUBLIC_JGC_CONSENT_REVISION` | client + server | no (integer ≥ 1) | `1` | every consent read: `consent` (`readConsent`, `consentFromHeader`, `defineConsent`, `posthogInitOptions`, `initWhenConsented`) · `consent/react` (`<Consent/>`, `useConsent`, `<ConsentGate/>`) · `gtm/react` · `track` (`consented()`) · `consent/server`. **Bumping it re-prompts every visitor.** |
| `NEXT_PUBLIC_JGC_LEGAL_PATH` | client | no (same-origin path containing `{doc}`) | `/{lang}/legal/{doc}` | `consent/react`: banner links · `legal`: `<LegalLinks/>` |
| `NEXT_PUBLIC_JGC_TRACK_URL` | client | no (same-origin path) | `/api/track` | `track`: `createClientTracker` mandatory beacon · `consent/react`: `<Consent/>` consent record |
| `NEXT_PUBLIC_JGC_SELLS` | client | no (`"true"` = on) | off | `legal`: `<LegalLinks/>` shows the 特商法 link |
| `NEXT_PUBLIC_GTM_ID` | client | **yes, for GTM** (`^GTM-[A-Z0-9]+$`) | — (no GTM) | `gtm/react`: `<GoogleTagManager/>` |
| `NEXT_PUBLIC_META_PIXEL_ID` | client | no — optional (`^\d{6,20}$`, the Meta dataset/pixel id) | — (no pixel, silently) | `meta/react`: `<MetaPixel/>` |

Not env, on purpose: **PostHog keys stay site-owned** — the site creates its posthog-js / posthog-node
clients from its own `NEXT_PUBLIC_POSTHOG_KEY` / host and passes the instances (`posthog` props). The
**vendor list** stays a prop (`vendors`): it is the generated `legal_render.py consent` JSON, not config.

### What each feature needs

- **Cookie banner** (`<Consent/>`): `NEXT_PUBLIC_JGC_APP_NAME` + `NEXT_PUBLIC_JGC_CONTACT_EMAIL`, the
  `vendors` prop, `consent.css`. Optional: `_CONSENT_REVISION`, `_LEGAL_PATH`, `_TRACK_URL`.
- **Tracking** (`createClientTracker`, `createServerTracker`, `createTrackRoute`): `NEXT_PUBLIC_JGC_APP_ID`
  + the site's PostHog instance. Optional: `_CONSENT_REVISION`, `_TRACK_URL` (must match the route's path).
- **GTM / GA4** (`<GoogleTagManager/>`): `NEXT_PUBLIC_GTM_ID`. Loads only after Personalization consent.
- **Meta Pixel** (`<MetaPixel/>`): `NEXT_PUBLIC_META_PIXEL_ID`. Loads only after Personalization consent.
- **Legal pages + footer** (`<LegalLinks/>`, `<LegalDocument/>`, `<CookieTable/>`): nothing required.
  Optional: `NEXT_PUBLIC_JGC_LEGAL_PATH`, `NEXT_PUBLIC_JGC_SELLS=true` for sites that sell.

## Install (every JGC site — website-baseline site.18)

```ts
// next.config — committed defaults, a deploy env var still overrides:
env: {
  NEXT_PUBLIC_JGC_APP_ID: process.env.NEXT_PUBLIC_JGC_APP_ID ?? "zucity",
  NEXT_PUBLIC_JGC_APP_NAME: process.env.NEXT_PUBLIC_JGC_APP_NAME ?? "ZuCity",
  NEXT_PUBLIC_JGC_CONTACT_EMAIL: process.env.NEXT_PUBLIC_JGC_CONTACT_EMAIL ?? "hello@zucity.org",
  NEXT_PUBLIC_JGC_SELLS: process.env.NEXT_PUBLIC_JGC_SELLS ?? "true",
  NEXT_PUBLIC_GTM_ID: process.env.NEXT_PUBLIC_GTM_ID ?? "GTM-5V6ZLSZ5",
},
```

```tsx
// 1. npm i -E @japanglobal/kit
// 2. root layout:   import "@japanglobal/kit/consent.css";
// 3. client shell:  <Consent config={{ lang, vendors }} posthog={posthog} />  +  <GoogleTagManager />  +  <MetaPixel />
// 4. initWhenConsented(() => posthog.init(key, { ...opts, ...posthogInitOptions() }))
//    (PostHog never starts — no config/flags fetch — before Personalization is granted)
// 5. export const track = createClientTracker({ posthog, dataLayer?: { grant, scrub }, meta?: { grant, scrub } })
//    every emit goes through it; on sign-in setUserId(memberId), on sign-out setUserId(null)
// 6. app/api/track/route.ts:  export const POST = createTrackRoute({ posthog: posthogNode, getMemberId, after })
// 7. app/[locale]/legal/[doc]/page.tsx renders src/content/legal/<lang>/<doc>.md with <LegalDocument/>
// 8. footer: <LegalLinks lang={lang} />
// 9. vendors + markdown: python3 workflows/legal_render.py sync <app> --repo <site> --strict   (JGC vault)
```

## GTM / GA4 / Meta — zero setup

Nothing to configure in the GTM or Meta UIs. Deploy with the env vars and events flow.

- **GA4**: the GTM container needs only its **Google tag** (GA4 config) — already present. The kit pushes
  gtag commands onto `window.dataLayer` as `arguments` objects: `gtag('event', name, {...props, app_id,
  event_id?})` from the `dataLayer` leg, `gtag('set', {user_id})` from `setUserId()`. The Google tag
  executes them as-is: every event reaches GA4 with its params, and `user_id` rides every following hit.
  (A bare `{event: …}` object push reaches no GA4 tag without GTM triggers — the kit never sends one.)
- **Do NOT add GA4 event tags, Data Layer Variables, or a Meta Pixel tag in GTM** — each one double counts
  what the kit already sends.
- **Meta**: only `NEXT_PUBLIC_META_PIXEL_ID`. `<MetaPixel/>` installs Meta's standard base code
  (fbevents.js, `init`, `PageView`) after consent; fbevents.js itself counts client-side route changes
  (history.pushState) as PageViews. The `meta` leg sends mapped names as standard events:

  | canonical | Meta | canonical | Meta |
  |---|---|---|---|
  | `purchase` | `Purchase` | `sign_up` | `CompleteRegistration` |
  | `begin_checkout` | `InitiateCheckout` | `search` | `Search` |
  | `add_to_cart` | `AddToCart` | `add_payment_info` | `AddPaymentInfo` |
  | `view_item` | `ViewContent` | `add_to_wishlist` | `AddToWishlist` |
  | `generate_lead` | `Lead` | anything else | not sent (`unmapped`) |

- **CAPI dedup**: give an event a deterministic `uuid` and it travels as GA4 `event_id` and Meta
  `eventID`; send the same id as `event_id` from the server (CAPI) and Meta keeps one.
- Consent: both legs are gated on Personalization (never exempt) and the site's grant; no consent ⇒ no
  container, no pixel, no pushes, no fbq calls.

## The tracking chain

```ts
// Sink = the terminal send. Middleware = (sink) => sink. pipe(sink, a, b) ≡ a(b(sink)): reads top-down.
const track = fanOut(
  label("posthog")(either(consented("personalization"), posthogSink(posthog),
                          pipe(beaconSink("/api/track"), gate(isMandatory, "no_consent")))),
  label("gtm")(pipe(dataLayerSink(), gate(consented("personalization"), "no_consent"), gate(granted, "no_grant"))),
  label("meta")(pipe(metaPixelSink(), gate(consented("personalization"), "no_consent"), gate(granted, "no_grant"))),
);
```

- No consent ⇒ no non-essential sink is called. A gated event returns `{ skipped: "<plane>:<name>:<reason>" }`.
- `MANDATORY_EVENTS` pass without consent only on the first-party product plane, only via the server.
  Ads legs never take an exemption (`createServerTracker` wraps every ads leg in a non-exempt gate).
- `/api/track` accepts only `consent_updated`, `login`, `logout` from a browser — commerce facts are server-only.

## Develop

`npm run lint && npm run typecheck && npm test && npm run build`. A new setting is a new row in the
table above and a literal read in `src/env.ts` — nowhere else. Publish: bump `version`, tag `v<version>`, push the tag.
