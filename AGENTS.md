# AGENTS.md — @japanglobal/kit

- Law lives in the JGC vault: `docs/software/website-baseline.md` site.17 (how sites use the kit), sec.* (security
  headers, CSP presets, throttle), `docs/legal/` (copy, vendors). A CSP origin lands in a preset with its source cited.
- Policy belongs in predicates/middlewares (`src/track/core.ts`), never inside a sink.
- Env law: `src/env.ts` is the only module that reads `process.env` — literal `process.env.NEXT_PUBLIC_X`
  reads (bundler inlining), validated, invalid = unset, never a throw. Props beat env. A new variable lands in
  `src/env.ts`, its tests, and the README "Environment variables" table in the same change.
- Deny by default: anything unreadable is no consent. Ads legs never take `exempt`.
- The browser loads only PostHog + GTM. GA4 gets gtag commands (`arguments` objects) on the dataLayer,
  executed by the container's Google tag; Meta lives only in the container (its Meta Pixel tag). The kit
  ships no Meta code. Never require a GTM trigger/variable or a GA4 Event tag, never a bare `{event}` push.
- Every change: `npm run lint && npm run typecheck && npm test && npm run build`; EN/JA copy keys stay identical (tested).
- Pin dependencies exact; licenses MIT/ISC/Apache only.
- Release: bump `version`, tag `v<version>`; CI publishes with provenance. Sites pin the exact version.
