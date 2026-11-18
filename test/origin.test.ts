import { describe, expect, it } from "vitest";
import { originVerdict } from "../src/security/origin.js";

const live = { found: true };
describe("originVerdict (jgc-origin-check, sec.7) — fail closed", () => {
  it.each([
    ["every direct request = firewall deny → locked", live, [{ status: 403, mitigated: "deny" }, { status: 403, mitigated: "DENY" }], 0],
    ["403 without the firewall marker (app 403) → unproven", live, [{ status: 403 }], 2],
    ["403 challenge is not a lock → unproven", live, [{ status: 403, mitigated: "challenge" }], 2],
    ["404 from the app → unproven (origin answered)", live, [{ status: 404 }], 2],
    ["405 from the app → unproven", live, [{ status: 405 }], 2],
    ["401 deployment protection → unproven", live, [{ status: 401 }], 2],
    ["429 → unproven", live, [{ status: 429 }], 2],
    ["500 / 502 outage → unproven", live, [{ status: 500 }, { status: 502 }], 2],
    ["one direct request answered → open", live, [{ status: 403, mitigated: "deny" }, { status: 200 }], 1],
    ["a redirect is an answer → open", live, [{ status: 307 }], 1],
    ["all direct requests errored → unproven, never locked", live, [{ error: "ETIMEDOUT" }, { error: "ECONNRESET" }], 2],
    ["refused + errored → unproven", live, [{ status: 403, mitigated: "deny" }, { error: "ETIMEDOUT" }], 2],
    ["open wins over errors", live, [{ error: "ETIMEDOUT" }, { status: 200 }], 1],
    ["no Vercel IP to test → unproven", live, [], 2],
    ["no record on public resolvers → not live", { found: false }, [], 0],
    ["resolver error → unproven, never 'not live'", { found: false, hardError: "ETIMEOUT" }, [], 2],
  ] as const)("%s", (_, dns, direct, code) => {
    expect(originVerdict(dns, direct).code).toBe(code);
  });
});
