/**
 * The tracking chain — higher-order functions over sinks. Isomorphic, zero deps.
 *
 *   Sink       (e) => R        the terminal send: posthog.capture, gtag, a POST. No policy inside.
 *   Pred       (e) => boolean  a decision: consented(), isMandatory, a grant check.
 *   Middleware (sink) => sink  gate / map: policy, stacked with pipe().
 *
 *   pipe(sink, a, b)  ≡  a(b(sink))  — an event passes a, then b, then the sink, so a chain reads top-down.
 *
 * A gated-out event returns a Skip (never throws, never calls the sink); label() names the plane so
 * fan-out reports read "ga4:purchase:no_consent".
 */

export type Sink<E, R> = (e: E) => R;
export type Pred<E> = (e: E) => boolean;
export interface Skip {
  readonly skipped: string;
}
export type Middleware<E> = <R>(sink: Sink<E, R>) => Sink<E, R | Skip>;

export const skip = (reason: string): Skip => ({ skipped: reason });

export const isSkip = (x: unknown): x is Skip =>
  typeof x === "object" && x !== null && typeof (x as { skipped?: unknown }).skipped === "string";

/** Drop the event with `reason` unless `pred` holds. The sink is never called on a drop. */
export const gate =
  <E>(pred: Pred<E>, reason: string): Middleware<E> =>
  (sink) =>
  (e) =>
    pred(e) ? sink(e) : skip(reason);

/** Transform the event before the sink (stamp app_id, scrub keys). */
export const map =
  <E>(f: (e: E) => E): Middleware<E> =>
  (sink) =>
  (e) =>
    sink(f(e));

/** Route each event to `a` when `pred` holds, else to `b`. */
export const either =
  <E, A, B>(pred: Pred<E>, a: Sink<E, A>, b: Sink<E, B>): Sink<E, A | B> =>
  (e) =>
    pred(e) ? a(e) : b(e);

/** Send to every sink, results in order. */
export const fanOut =
  <E, R>(...sinks: readonly Sink<E, R>[]): Sink<E, R[]> =>
  (e) =>
    sinks.map((s) => s(e));

/** A throw (or a rejected promise) becomes Skip("error"): tracking never breaks the caller. */
export const safe =
  <E, R>(sink: Sink<E, R>): Sink<E, R | Skip> =>
  (e) => {
    try {
      const r = sink(e);
      return (r instanceof Promise ? r.catch(() => skip("error")) : r) as R | Skip;
    } catch {
      return skip("error");
    }
  };

/** Prefix every Skip with `<plane>:<event name>:`. */
export const label =
  (plane: string) =>
  <E extends { readonly name: string }, R>(sink: Sink<E, R>): Sink<E, R> =>
  (e) => {
    const r = sink(e);
    return (isSkip(r) ? skip(`${plane}:${e.name}:${r.skipped}`) : r) as R;
  };

/** Stack middlewares on a sink, outermost first. */
export function pipe<E, R>(sink: Sink<E, R>, ...mws: readonly Middleware<E>[]): Sink<E, R | Skip> {
  return mws.reduceRight<Sink<E, R | Skip>>((inner, mw) => mw(inner), sink);
}
