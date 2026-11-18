/**
 * The prod-dependency audit gate (website-baseline sec.3): `npm audit --omit=dev --json` → every high/critical
 * advisory fails unless `.audit-allow.json` lists its GHSA with a reason and an unexpired `until` date — the place
 * for advisories with no patched release, reviewed and dated, never a blanket ignore.
 */

export interface AllowEntry {
  readonly id: string; // GHSA-xxxx-xxxx-xxxx
  readonly reason: string;
  readonly until: string; // YYYY-MM-DD, inclusive
}

export interface Finding {
  readonly id: string;
  readonly severity: string;
  readonly pkg: string;
  readonly title: string;
  readonly allowed: boolean;
}

interface Via {
  source?: number;
  name?: string;
  title?: string;
  url?: string;
  severity?: string;
}
interface AuditReport {
  vulnerabilities?: Record<string, { via?: (string | Via)[] }>;
  metadata?: { vulnerabilities?: Record<string, number> };
  error?: unknown;
}

/**
 * The audit really ran: npm answered with a report (its `metadata.vulnerabilities` counts), not an error object
 * (registry unreachable, ENOLOCK, auth). A report we could not get is never "ok".
 */
export function auditRan(report: unknown): report is AuditReport {
  if (typeof report !== "object" || report === null) return false;
  const r = report as AuditReport;
  return r.error === undefined && typeof r.vulnerabilities === "object" && typeof r.metadata?.vulnerabilities === "object";
}

const GATED = new Set(["high", "critical"]);

/** Root advisories at high/critical, each marked allowed or not (`today` = YYYY-MM-DD). */
export function auditFindings(report: AuditReport, allow: readonly AllowEntry[], today: string): Finding[] {
  const ok = new Map(allow.filter((a) => a.reason?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(a.until) && a.until >= today).map((a) => [a.id, a]));
  const seen = new Map<string, Finding>();
  for (const v of Object.values(report.vulnerabilities ?? {})) {
    for (const via of v.via ?? []) {
      if (typeof via === "string" || !GATED.has(via.severity ?? "")) continue;
      const id = /GHSA-[\w-]+/.exec(via.url ?? "")?.[0] ?? `npm-${via.source}`;
      if (!seen.has(id)) seen.set(id, { id, severity: via.severity!, pkg: via.name ?? "?", title: via.title ?? "", allowed: ok.has(id) });
    }
  }
  return [...seen.values()];
}
