# AGENTS.md — @japanglobal/kit

- Law lives in the JGC vault: `docs/software/website-baseline.md` site.17 (how sites use the kit), `docs/legal/` (copy, vendors).
- Policy belongs in predicates/middlewares (`src/track/core.ts`), never inside a sink.
- Deny by default: anything unreadable is no consent. Ads legs never take `exempt`.
- Every change: `npm run lint && npm run typecheck && npm test && npm run build`; EN/JA copy keys stay identical (tested).
- Pin dependencies exact; licenses MIT/ISC/Apache only.
- Release: bump `version`, tag `v<version>`; CI publishes with provenance. Sites pin the exact version.
