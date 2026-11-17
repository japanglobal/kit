/** The event every JGC tracker carries. Sites may extend it; the chain only needs `name`. */
export interface TrackEvent {
  readonly name: string;
  readonly props?: Readonly<Record<string, unknown>>;
  /** Deterministic dedup id (PostHog `uuid`), only when the caller has one. */
  readonly uuid?: string;
}
