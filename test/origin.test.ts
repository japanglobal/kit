import { describe, expect, it } from "vitest";
import { originVerdict } from "../src/security/origin.js";

const live = { found: true };
describe("originVerdict (jgc-origin-check, sec.7) — fail closed", () => {
  it.each([
    ["every direct request refused → locked", live, [{ status: 403 }, { status: 403 }], 0],
    ["one direct request answered → open", live, [{ status: 403 }, { status: 200 }], 1],
    ["a redirect is an answer → open", live, [{ status: 307 }], 1],
    ["all direct requests errored → unproven, never locked", live, [{ error: "ETIMEDOUT" }, { error: "ECONNRESET" }], 2],
    ["refused + errored → unproven", live, [{ status: 403 }, { error: "ETIMEDOUT" }], 2],
    ["open wins over errors", live, [{ error: "ETIMEDOUT" }, { status: 200 }], 1],
    ["no Vercel IP to test → unproven", live, [], 2],
    ["no record on public resolvers → not live", { found: false }, [], 0],
    ["resolver error → unproven, never 'not live'", { found: false, hardError: "ETIMEOUT" }, [], 2],
  ] as const)("%s", (_, dns, direct, code) => {
    expect(originVerdict(dns, direct).code).toBe(code);
  });
});
