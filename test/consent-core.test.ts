import { describe, expect, it } from "vitest";
import { consentFromHeader, cookieValue, readConsent } from "../src/consent/core.js";
import { consented } from "../src/track/consent.js";
import { cookie, DAY, names, NOW } from "./fixtures.js";

describe("readConsent", () => {
  it("reads a valid cookie", () => {
    expect(readConsent(cookie(), { now: NOW, revision: 1 })).toMatchObject({ personalization: true, partners: false, revision: 1 });
  });

  const garbage: (string | null | undefined)[] = [
    null,
    undefined,
    "",
    "%",
    "not-json",
    encodeURIComponent("[]"),
    encodeURIComponent("null"),
    encodeURIComponent('"str"'),
    "x".repeat(5000),
    cookie({ categories: "personalization" }),
    cookie({ categories: [1, 2] }),
    cookie({ revision: -1 }),
    cookie({ revision: 1.5 }),
    cookie({ revision: "1" }),
    cookie({ consentId: "" }),
    cookie({ consentId: 5 }),
    cookie({ consentId: "x".repeat(65) }),
    cookie({ expirationTime: NOW - 1 }),
    cookie({ expirationTime: "never" }),
  ];
  it.each(garbage.map((g, i) => [i, g]))("denies malformed/expired cookie #%i", (_i, raw) => {
    expect(readConsent(raw as string, { now: NOW })).toBeNull();
  });

  it("denies a stale revision (re-prompt)", () => {
    expect(readConsent(cookie({ revision: 1 }), { now: NOW, revision: 2 })).toBeNull();
  });

  it("finds the cookie in a header", () => {
    const h = `a=1; cc_cookie=${cookie()}; b=2`;
    expect(cookieValue(h)).toBe(cookie());
    expect(consentFromHeader(h, { now: NOW })?.personalization).toBe(true);
    expect(cookieValue("cc_cookie_x=1")).toBeNull();
  });
});

describe("consented — fuzz: no or bad consent ⇒ nothing passes", () => {
  const bad = [null, cookie({ expirationTime: NOW - DAY }), cookie({ categories: ["necessary"] }), "garbage"];
  const evs = names(250).map((name) => ({ name }));
  it.each(bad.map((b, i) => [i, b]))("cookie variant #%i", (_i, raw) => {
    const source = () => readConsent(raw as string | null, { now: NOW });
    const p = consented("personalization", { consent: source });
    const s = consented("partners", { consent: source });
    expect(evs.filter(p)).toEqual([]);
    expect(evs.filter(s)).toEqual([]);
  });

  it("partners needs its own grant", () => {
    const source = () => readConsent(cookie(), { now: NOW });
    expect(consented("partners", { consent: source })({ name: "x" })).toBe(false);
    expect(consented("personalization", { consent: source })({ name: "x" })).toBe(true);
  });
});
