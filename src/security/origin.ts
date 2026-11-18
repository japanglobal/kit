/**
 * The verdict of `jgc-origin-check` (website-baseline sec.7), pure so every branch is tested. Fail closed: an answer
 * we could not get is never "locked".
 */
export interface DnsResult {
  readonly found: boolean;
  /** A resolver error other than "no such record" (timeout, refused, servfail). */
  readonly hardError?: string;
}
/** A direct answer; `mitigated` = the response's `x-vercel-mitigated` header (Vercel Firewall action). */
export type Direct = { readonly status: number; readonly mitigated?: string } | { readonly error: string };

/** Only Vercel's firewall deny proves the lock — a 404, 405, 401 (deployment protection) or 5xx is the app answering. */
const refused = (d: Direct): boolean => "status" in d && d.status === 403 && d.mitigated?.toLowerCase() === "deny";

/** 0 = locked (every direct request = 403 + `x-vercel-mitigated: deny`) or not live · 1 = open (< 400) · 2 = unproven. */
export function originVerdict(dns: DnsResult, direct: readonly Direct[]): { code: 0 | 1 | 2; why: string } {
  if (!dns.found) return dns.hardError ? { code: 2, why: `DNS error ${dns.hardError}` } : { code: 0, why: "no DNS record — not live" };
  if (direct.length === 0) return { code: 2, why: "no Vercel IP to test" };
  if (direct.some((d) => "status" in d && d.status < 400)) return { code: 1, why: "a direct request was answered" };
  const unknown = direct.filter((d) => !refused(d)).length;
  if (unknown) return { code: 2, why: `${unknown}/${direct.length} direct requests were neither answered (< 400) nor a Vercel firewall deny` };
  return { code: 0, why: `${direct.length}/${direct.length} direct requests refused` };
}
