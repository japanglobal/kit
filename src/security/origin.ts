/**
 * The verdict of `jgc-origin-check` (website-baseline sec.7), pure so every branch is tested. Fail closed: an answer
 * we could not get is never "locked".
 */
export interface DnsResult {
  readonly found: boolean;
  /** A resolver error other than "no such record" (timeout, refused, servfail). */
  readonly hardError?: string;
}
export type Direct = { readonly status: number } | { readonly error: string };

/** 0 = locked or not live · 1 = origin open · 2 = unproven. */
export function originVerdict(dns: DnsResult, direct: readonly Direct[]): { code: 0 | 1 | 2; why: string } {
  if (!dns.found) return dns.hardError ? { code: 2, why: `DNS error ${dns.hardError}` } : { code: 0, why: "no DNS record — not live" };
  if (direct.length === 0) return { code: 2, why: "no Vercel IP to test" };
  if (direct.some((d) => "status" in d && d.status < 400)) return { code: 1, why: "a direct request was answered" };
  const unknown = direct.filter((d) => "error" in d).length;
  if (unknown) return { code: 2, why: `${unknown}/${direct.length} direct requests got no answer` };
  return { code: 0, why: `${direct.length}/${direct.length} direct requests refused` };
}
