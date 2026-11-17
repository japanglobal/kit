import { describe, expect, it, vi } from "vitest";
import { either, fanOut, gate, isSkip, label, map, pipe, safe, skip } from "../src/track/core.js";

type E = { name: string; props?: Record<string, unknown> };
const ev: E = { name: "purchase", props: { a: 1 } };

describe("combinator laws", () => {
  it("gate false ⇒ sink never called, Skip(reason)", () => {
    const sink = vi.fn(() => true);
    expect(gate<E>(() => false, "no")(sink)(ev)).toEqual(skip("no"));
    expect(sink).not.toHaveBeenCalled();
    expect(gate<E>(() => true, "no")(sink)(ev)).toBe(true);
  });

  it("pipe applies middlewares outermost-first", () => {
    const seen: string[] = [];
    const tag = (t: string) => map<E>((e) => (seen.push(t), e));
    pipe((e: E) => (seen.push("sink"), e), tag("a"), tag("b"), tag("c"))(ev);
    expect(seen).toEqual(["a", "b", "c", "sink"]);
  });

  it("pipe: the first failing gate wins", () => {
    const r = pipe((_: E) => true, gate<E>(() => false, "first"), gate<E>(() => false, "second"))(ev);
    expect(r).toEqual(skip("first"));
  });

  it("label prefixes plane and event", () => {
    expect(label("ga4")(gate<E>(() => false, "no_grant")((_: E) => true))(ev)).toEqual(skip("ga4:purchase:no_grant"));
    expect(label("ga4")((_: E) => 1)(ev)).toBe(1);
  });

  it("safe never throws, and turns rejections into Skip", async () => {
    expect(safe((_: E) => { throw new Error("x"); })(ev)).toEqual(skip("error"));
    await expect(safe((_: E) => Promise.reject(new Error("x")))(ev)).resolves.toEqual(skip("error"));
  });

  it("fanOut preserves order; either routes", () => {
    expect(fanOut((_: E) => 1, (_: E) => 2, (_: E) => 3)(ev)).toEqual([1, 2, 3]);
    expect(either<E, string, string>((e) => e.name === "purchase", () => "a", () => "b")(ev)).toBe("a");
    expect(isSkip({ skipped: "x" })).toBe(true);
    expect(isSkip({ skipped: 1 })).toBe(false);
    expect(isSkip(null)).toBe(false);
  });
});
