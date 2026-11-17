# @japanglobal/kit

Shared code for Japan Global Council websites (zucity.org, japanglobal.org, zaibots.com).
MIT. One package, subpath exports; a new shared module is a new folder, not a new package.

| Import | What |
|---|---|
| `@japanglobal/kit/consent` | `readConsent`, `consentFromHeader`, `defineConsent`, `posthogInitOptions`, `applyConsentToPostHog` — edge-safe |
| `@japanglobal/kit/consent/react` | `<Consent/>` (bottom-bar banner), `useConsent`, `<ConsentGate/>`, `<CookieSettingsButton/>` |
| `@japanglobal/kit/consent/server` | `createTrackRoute` — `POST /api/track` for mandatory events without consent |
| `@japanglobal/kit/track` | the tracking chain: sinks + `gate` / `map` / `either` / `fanOut` / `label` / `safe` / `pipe`, `consented()`, presets |
| `@japanglobal/kit/legal` | `<LegalDocument/>`, `<LegalLinks/>`, `<CookieTable/>` |
| `@japanglobal/kit/legal/docs` | `LEGAL_DOCS`, `LEGAL_FILES` — edge-safe, for proxy route allow-lists |
| `@japanglobal/kit/consent.css` | banner styles (vanilla-cookieconsent + JGC overrides; theme with `--cc-*`) |

Banner engine: [vanilla-cookieconsent](https://github.com/orestbida/cookieconsent) 3.3.0 (MIT).

## Install (every JGC site — website-baseline site.17)

```tsx
// 1. npm i -E @japanglobal/kit
// 2. root layout:   import "@japanglobal/kit/consent.css";
// 3. client shell:  <Consent config={{ appName, lang, links: { privacy: "/{lang}/legal/privacy", cookies: "/{lang}/legal/cookies" }, contact, vendors }} posthog={posthog} />
// 4. initWhenConsented(() => posthog.init(key, { ...opts, ...posthogInitOptions({ revision: 1 }) }), { revision: 1 })
//    (PostHog never starts — no config/flags fetch — before Personalization is granted)
// 5. export const track = createClientTracker({ appId, posthog, gtag?: { grant, scrub } })   // every emit goes through it
// 6. app/api/track/route.ts:  export const POST = createTrackRoute({ posthog: posthogNode, appId, getMemberId, after })
// 7. app/[locale]/legal/[doc]/page.tsx renders src/content/legal/<lang>/<doc>.md with <LegalDocument/>
// 8. footer: <LegalLinks lang={lang} tokushoho={sells} />
// 9. vendors + markdown: python3 workflows/legal_render.py sync <app> --repo <site> --strict   (JGC vault)
```

## The tracking chain

```ts
// Sink = the terminal send. Middleware = (sink) => sink. pipe(sink, a, b) ≡ a(b(sink)): reads top-down.
const track = fanOut(
  label("posthog")(either(consented("personalization"), posthogSink(posthog),
                          pipe(beaconSink("/api/track"), gate(isMandatory, "no_consent")))),
  label("ga4")(pipe(gtagSink(), gate(consented("personalization"), "no_consent"), gate(granted, "no_grant"))),
);
```

- No consent ⇒ no non-essential sink is called. A gated event returns `{ skipped: "<plane>:<name>:<reason>" }`.
- `MANDATORY_EVENTS` pass without consent only on the first-party product plane, only via the server.
  Ads legs never take an exemption (`createServerTracker` wraps every ads leg in a non-exempt gate).
- `/api/track` accepts only `consent_updated`, `login`, `logout` from a browser — commerce facts are server-only.

## Develop

`npm run lint && npm run typecheck && npm test && npm run build`. Publish: bump `version`, tag `v<version>`, push the tag.
