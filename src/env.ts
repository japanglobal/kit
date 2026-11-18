/**
 * The kit's configuration — the ONLY module that reads `process.env`. Every variable is referenced
 * literally (`process.env.NEXT_PUBLIC_X`) so Next/webpack/turbopack inline it into client bundles.
 * Invalid values are treated as unset (never a throw — this runs in the browser). Props passed
 * explicitly win; these are the defaults. The README's "Environment variables" table is the reference.
 */

export type KitEnvVar =
  | "NEXT_PUBLIC_JGC_APP_ID"
  | "NEXT_PUBLIC_JGC_APP_NAME"
  | "NEXT_PUBLIC_JGC_CONTACT_EMAIL"
  | "NEXT_PUBLIC_JGC_CONSENT_REVISION"
  | "NEXT_PUBLIC_JGC_LEGAL_PATH"
  | "NEXT_PUBLIC_JGC_TRACK_URL"
  | "NEXT_PUBLIC_JGC_SELLS"
  | "NEXT_PUBLIC_GTM_ID"
  | "NEXT_PUBLIC_META_PIXEL_ID";

export interface KitEnv {
  /** `app_id` stamped on every event. Required for tracking. */
  readonly appId: string | null;
  /** Site name in the banner and legal copy. Required for the banner. */
  readonly appName: string | null;
  /** Privacy contact shown in the banner. Required for the banner. */
  readonly contactEmail: string | null;
  /** Cookie-policy revision (integer ≥ 1). Bumping it re-prompts every visitor. */
  readonly consentRevision: number;
  /** Legal page path with `{lang}` and `{doc}`. */
  readonly legalPath: string;
  /** Same-origin path of the track route (mandatory beacons + consent records). */
  readonly trackUrl: string;
  /** The site sells: show the 特商法 link. */
  readonly sells: boolean;
  /** GTM container id; null = no GTM. */
  readonly gtmId: string | null;
  /** Meta Pixel (dataset) id; null = no pixel. */
  readonly metaPixelId: string | null;
}

export const DEFAULTS = {
  consentRevision: 1,
  legalPath: "/{lang}/legal/{doc}",
  trackUrl: "/api/track",
} as const;

export const APP_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const GTM_ID_RE = /^GTM-[A-Z0-9]+$/;
export const META_PIXEL_ID_RE = /^\d{6,20}$/;
const EMAIL_RE = /^[^\s@<>"'&]+@[^\s@<>"'&]+\.[^\s@<>"'&]+$/;
const REVISION_RE = /^[1-9][0-9]{0,8}$/;
/** Same-origin path: one leading slash (not `//host`), no whitespace, quotes or angle brackets. */
const PATH_RE = /^\/(?!\/)[^\s"'<>\\]*$/;

/** One literal read per variable — a bundler inlines the expression; outside one, `process` may be missing. */
function read(get: () => string | undefined): string | undefined {
  try {
    const v = get()?.trim();
    return v ? v : undefined;
  } catch {
    return undefined;
  }
}

const match = (re: RegExp, v: string | undefined): string | null => (v !== undefined && re.test(v) ? v : null);

export function parseRevision(v: string | undefined): number {
  return v !== undefined && REVISION_RE.test(v) ? Number(v) : DEFAULTS.consentRevision;
}

export function parseAppName(v: string | undefined): string | null {
  return v !== undefined && v.length <= 64 && !/[<>&"]/.test(v) ? v : null;
}

export function parseLegalPath(v: string | undefined): string {
  return v !== undefined && PATH_RE.test(v) && v.includes("{doc}") ? v : DEFAULTS.legalPath;
}

export function parseTrackUrl(v: string | undefined): string {
  return match(PATH_RE, v) ?? DEFAULTS.trackUrl;
}

/** The validated configuration, read fresh on every call (cheap; tests can stub the env). */
export function kitEnv(): KitEnv {
  return {
    appId: match(APP_ID_RE, read(() => process.env.NEXT_PUBLIC_JGC_APP_ID)),
    appName: parseAppName(read(() => process.env.NEXT_PUBLIC_JGC_APP_NAME)),
    contactEmail: match(EMAIL_RE, read(() => process.env.NEXT_PUBLIC_JGC_CONTACT_EMAIL)),
    consentRevision: parseRevision(read(() => process.env.NEXT_PUBLIC_JGC_CONSENT_REVISION)),
    legalPath: parseLegalPath(read(() => process.env.NEXT_PUBLIC_JGC_LEGAL_PATH)),
    trackUrl: parseTrackUrl(read(() => process.env.NEXT_PUBLIC_JGC_TRACK_URL)),
    sells: read(() => process.env.NEXT_PUBLIC_JGC_SELLS) === "true",
    gtmId: match(GTM_ID_RE, read(() => process.env.NEXT_PUBLIC_GTM_ID)),
    metaPixelId: match(META_PIXEL_ID_RE, read(() => process.env.NEXT_PUBLIC_META_PIXEL_ID)),
  };
}

const isDev = (): boolean => read(() => process.env.NODE_ENV) !== "production";
const reported = new Set<string>();

/**
 * A required value is missing: the feature no-ops. In development, one console.error per variable
 * names it. Returns null so callers can `return missing(...)`.
 */
export function missing(name: KitEnvVar, feature: string): null {
  if (isDev() && !reported.has(name)) {
    reported.add(name);
    console.error(`@japanglobal/kit: ${feature} is off — set ${name} (or pass the prop).`);
  }
  return null;
}

/** Test seam: forget which variables were reported. */
export function resetMissingReports(): void {
  reported.clear();
}
