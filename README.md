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
| `@japanglobal/kit/legal` | `<LegalDocument/>`, `<LegalLinks/>`, `<CookieTable/>` |
| `@japanglobal/kit/legal/docs` | `LEGAL_DOCS`, `LEGAL_FILES` — edge-safe, for proxy route allow-lists |
| `@japanglobal/kit/consent.css` | banner styles (vanilla-cookieconsent + JGC overrides; theme with `--cc-*`) |
| `@japanglobal/kit/env` | `kitEnv()` — the validated environment below (edge-safe) |

Banner engine: [vanilla-cookieconsent](https://github.com/orestbida/cookieconsent) 3.3.0 (MIT).

## Environment variables

The kit is configured by environment. `src/env.ts` is the only module that reads `process.env`; every
variable is referenced literally; `NEXT_PUBLIC_*` ones are inlined into client bundles at build time
(set them before `next build`), `JGC_ORIGIN_KEY` is server-only and never reaches a bundle. An invalid value counts as unset — the kit never throws over config. A prop
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
| `JGC_ORIGIN_KEY` | server only | **yes, behind Cloudflare** (≥ 32 chars; = Cloudflare's `x-jgc-origin` header) | — (`cf-connecting-ip` never trusted) | `consent/server`: `cloudflareClientIp` |

Not env, on purpose: **PostHog keys stay site-owned** — the site creates its posthog-js / posthog-node
clients from its own `NEXT_PUBLIC_POSTHOG_KEY` / host and passes the instances (`posthog` props). The
**vendor list** stays a prop (`vendors`): it is the generated `legal_render.py consent` JSON, not config.

### What each feature needs

- **Cookie banner** (`<Consent/>`): `NEXT_PUBLIC_JGC_APP_NAME` + `NEXT_PUBLIC_JGC_CONTACT_EMAIL`, the
  `vendors` prop, `consent.css`. Optional: `_CONSENT_REVISION`, `_LEGAL_PATH`, `_TRACK_URL`.
- **Tracking** (`createClientTracker`, `createServerTracker`, `createTrackRoute`): `NEXT_PUBLIC_JGC_APP_ID`
  + the site's PostHog instance. Optional: `_CONSENT_REVISION`, `_TRACK_URL` (must match the route's path).
- **GTM — GA4 + Meta** (`<GoogleTagManager/>`): `NEXT_PUBLIC_GTM_ID`. Loads only after Personalization
  consent. Meta needs no variable: it is the container's Meta Pixel tag.
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
// 3. client shell:  <Consent config={{ lang, vendors }} posthog={posthog} />  +  <GoogleTagManager />
// 4. initWhenConsented(() => posthog.init(key, { ...opts, ...posthogInitOptions() }))
//    (PostHog never starts — no config/flags fetch — before Personalization is granted)
// 5. export const track = createClientTracker({ posthog, dataLayer?: { grant, scrub } })
//    every emit goes through it; on sign-in setUserId(memberId), on sign-out setUserId(null)
// 6. app/api/track/route.ts:  export const POST = createTrackRoute({ posthog: posthogNode, getMemberId, after })
// 7. app/[locale]/legal/[doc]/page.tsx renders src/content/legal/<lang>/<doc>.md with <LegalDocument/>
// 8. footer: <LegalLinks lang={lang} />
// 9. vendors + markdown: python3 workflows/legal_render.py sync <app> --repo <site> --strict   (JGC vault)
// 10. next.config: export default withSecurity(config, { sources: [gtm, ga4, googleAds, metaPixel, posthog] })
//     + a site test: checkSecurityHeaders(<headers()>) → []   (website-baseline sec.*)
```

## GTM / GA4 / Meta — the browser loads only PostHog + GTM

The kit loads exactly two things in the browser, both only after Personalization consent: PostHog and the
GTM container (`<GoogleTagManager/>`). Every other vendor lives **inside the container**. The kit ships no
Meta code — no pixel, no `fbq`, no fbevents.js.

The container holds two tags:

- **Google tag (GA4 config)** — zero config. The kit pushes gtag commands onto `window.dataLayer` as
  `arguments` objects: `gtag('event', name, {...props, app_id, event_id?})` from the `dataLayer` leg,
  `gtag('set', {user_id})` from `setUserId()`. The Google tag executes them as-is: **every kit event reaches
  GA4 with its params**, and `user_id` rides every following hit. (A bare `{event: …}` object push reaches no
  GA4 tag without GTM triggers — the kit never sends one.)
- **Meta Pixel tag** — Meta reaches the browser only through this tag (configured in GTM, not in code).
- **Never add a GA4 Event tag** (nor GA4 triggers / Data Layer Variables for it): the Google tag already
  sends every kit event, so a GA4 Event tag on "all events" double counts. Delete any that exist.
- Server-side conversions (Meta CAPI, GA4 Measurement Protocol) stay the site's server code; give an event a
  deterministic `uuid` and it travels as GA4 `event_id`, reusable as the server event's dedup id.
- Consent: the `gtm` leg is gated on Personalization (never exempt) and the site's grant; no consent ⇒ no
  container, no pushes — so no GA4 and no Meta.

## The tracking chain

```ts
// Sink = the terminal send. Middleware = (sink) => sink. pipe(sink, a, b) ≡ a(b(sink)): reads top-down.
const track = fanOut(
  label("posthog")(either(consented("personalization"), posthogSink(posthog),
                          pipe(beaconSink("/api/track"), gate(isMandatory, "no_consent")))),
  label("gtm")(pipe(dataLayerSink(), gate(consented("personalization"), "no_consent"), gate(granted, "no_grant"))),
);
```

- No consent ⇒ no non-essential sink is called. A gated event returns `{ skipped: "<plane>:<name>:<reason>" }`.
- `MANDATORY_EVENTS` pass without consent only on the first-party product plane, only via the server.
  Ads legs never take an exemption (`createServerTracker` wraps every ads leg in a non-exempt gate).
- `/api/track` accepts only `consent_updated`, `login`, `logout` from a browser — commerce facts are server-only.

## Security — `@japanglobal/kit/security` (website-baseline sec.*)

```ts
import { withSecurity, gtm, ga4, googleAds, metaPixel, posthog, privy, stripe } from "@japanglobal/kit/security";
export default withSecurity(nextConfig, {
  // an origin enters only through a preset (a feature) or a site-local extra whose comment cites the code that loads it
  sources: [gtm, ga4, googleAds, metaPixel, posthog, privy({ customApiUrl, walletConnect: true })],
  reportUri: "/ingest/report/?token=<posthog project key>", // optional: violations land in PostHog
});
```

- `withSecurity` keeps the config's own `headers()` entries verbatim, appends CSP, HSTS (2 y, preload), nosniff,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, Permissions-Policy for `/:path*`,
  and turns `X-Powered-By` + browser source maps off.
- CSP base: `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
  `frame-ancestors 'none'`. `'unsafe-eval'` only under `next dev` (NODE_ENV=development).
- `checkSecurityHeaders(headers)` → violations (`[]` = compliant). Accepts fetch `Headers`, a record, or the
  `{ key, value }[]` config form. Sites run it in a unit test on `headers()` and on a live `curl -sI`.
- `createTrackRoute` throttles per IP (`x-real-ip`, else first `x-forwarded-for`; no IP ⇒ not pooled):
  120 / 60 s → 429 + `Retry-After`; bodies over 8 KiB → 413 before parsing. Options `limit`, `maxBodyBytes`,
  `clientIp` — a Cloudflare-proxied site passes `cloudflareClientIp`: `cf-connecting-ip` only when the request
  carries the origin secret (`x-jgc-origin` = `JGC_ORIGIN_KEY`), else Vercel's client IP.

- `jgc-audit` (bin): `npm audit --omit=dev`, exit 1 on any high/critical advisory not listed in the site's
  `.audit-allow.json` — `[{ "id": "GHSA-…", "reason": "<why no fix + why not exploitable here>", "until": "YYYY-MM-DD",
  "followup": "<issue URL>" }]`. Only for advisories with no patched release; entries expire. Exit 2 when npm audit
  produced no report (registry unreachable, no lockfile) — never a pass. CI step: `npx jgc-audit`.

### Vercel WAF — the global cap (the in-code limiter is per instance)

`firewall/track-rate-limit.json`: POST `/api/track`, 600 / 60 s per IP, exceed action `log`. From the site repo:

```sh
vercel link
vercel firewall rules add --json "$(cat node_modules/@japanglobal/kit/firewall/track-rate-limit.json)" --yes
vercel firewall diff            # review, then a human runs: vercel firewall publish --yes
# after 7 days of log data (dashboard → Firewall → filter by rule): enforce
vercel firewall rules edit "jgc: throttle POST /api/track" --rate-limit-action rate_limit --yes && vercel firewall diff
```

### Cloudflare origin lock (every JGC site — website-baseline sec.7)

Every site runs behind Cloudflare (proxied DNS, SSL **Full (strict)**), and its Vercel origin answers only
Cloudflare. Vercel has no TCP firewall, so the lock is a WAF rule. **The enforced lock is the secret header**: an IP
allowlist cannot be the lock on its own — every Cloudflare customer (a Worker on any account) egresses from the same
ranges, and Vercel's Verified Proxy (on by default for Cloudflare) may rewrite the client IP to the visitor's, which
would make an IP allowlist deny everyone. The IP rule stays as a logged second signal.

1. **Secret header.** Cloudflare → Rules → Transform Rules → *Modify request header*: set `x-jgc-origin` = a random
   ≥ 32-char secret on all requests to the zone. Vercel env (server-only): `JGC_ORIGIN_KEY` = the same secret (lets
   `cloudflareClientIp` trust `cf-connecting-ip`). Rotate both together.
2. **Stage both rules in log mode** from the site repo:
   ```sh
   vercel link
   R=node_modules/@japanglobal/kit/firewall
   vercel firewall rules add --json "$(sed "s/\${JGC_ORIGIN_KEY}/$JGC_ORIGIN_KEY/" $R/origin-lock-header.json)" --yes
   vercel firewall rules add --json "$(cat $R/origin-lock-cloudflare-ips.json)" --yes
   vercel firewall diff   # a human publishes: vercel firewall publish --yes
   ```
3. **Read 7 days** (dashboard → Firewall → filter by rule): the header rule must match only bypass traffic (no real
   visitor, no Cloudflare-routed request). The IP rule's hits tell you whether Vercel sees Cloudflare's IPs.
4. **Enforce the header rule**: `vercel firewall rules edit "jgc: origin lock — Cloudflare origin secret" --action deny
   --yes`, publish. Keep the IP rule in log mode. Both exempt `/api/cron/` (Vercel Cron calls the deployment directly;
   the route must fail closed on `CRON_SECRET`) and `/.well-known/`.
5. **Prove it**: `npx jgc-origin-check <domain>` — requests the Vercel edge IPs directly with Host/SNI = the domain.
   Exit 0 = every one refused (or the domain has no DNS record on public resolvers) · 1 = ORIGIN OPEN · 2 = unproven
   (DNS or network error) — never a pass. Run it after every firewall change and on a schedule.

Cloudflare's ranges live in `firewall/cloudflare-ips.json` (`npm run firewall:cloudflare` regenerates it and the IP
rule; the weekly `cloudflare-ranges` workflow goes red on drift → release the kit, re-stage the rule). Global rate
limits for a proxied site belong at Cloudflare (it sees the visitor); the Vercel WAF throttle keys on what Vercel sees.

### Residual risk (known, accepted)

- `script-src 'unsafe-inline'`: Next's inline bootstrap on prerendered pages; nonces would force dynamic rendering.
- Whoever can publish the GTM container runs code on every consented page. GTM Custom JavaScript variables need
  `eval` and are blocked by this CSP — use Data Layer variables or sandboxed templates.
- The in-code limiter is per server instance; the WAF rule is the global cap (WAF counters are per region).
- `img-src https:` is allowed (passive; sites with user/DB-supplied image URLs need it). Code-carrying directives never are.

## Develop

`npm run lint && npm run typecheck && npm test && npm run build`. A new setting is a new row in the
table above and a literal read in `src/env.ts` — nowhere else. Publish: bump `version`, tag `v<version>`, push the tag.
