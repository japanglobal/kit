import { describe, expect, it } from "vitest";
import { auditFindings } from "../src/security/audit.js";

const report = {
  vulnerabilities: {
    picomatch: { via: [{ source: 1, name: "picomatch", title: "ReDoS", url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf", severity: "high" }] },
    micromatch: { via: ["picomatch"] },
    next: { via: [{ source: 2, name: "next", title: "RCE", url: "https://github.com/advisories/GHSA-2464-fhr4-w9xw", severity: "critical" }] },
    postcss: { via: [{ source: 3, name: "postcss", title: "moderate", url: "https://github.com/advisories/GHSA-mmmm-mmmm-mmmm", severity: "moderate" }] },
  },
};
const allow = [{ id: "GHSA-fc5q-39xc-vjpf", reason: "no patched release; dev-only watcher", until: "2026-12-31" }];

describe("auditFindings (sec.3 gate)", () => {
  it("root high/critical advisories only, deduped; moderate and transitive rollups ignored", () => {
    expect(auditFindings(report, [], "2026-11-18").map((f) => f.id)).toEqual(["GHSA-fc5q-39xc-vjpf", "GHSA-2464-fhr4-w9xw"]);
  });
  it("an allowlisted id passes; others still fail", () => {
    const f = auditFindings(report, allow, "2026-11-18");
    expect(f.filter((x) => !x.allowed).map((x) => x.id)).toEqual(["GHSA-2464-fhr4-w9xw"]);
  });
  it("expired or reasonless entries do not allow", () => {
    expect(auditFindings(report, allow, "2027-01-01").every((x) => !x.allowed)).toBe(true);
    expect(auditFindings(report, [{ ...allow[0]!, reason: " " }], "2026-11-18").every((x) => !x.allowed)).toBe(true);
  });
  it("clean report: nothing", () => {
    expect(auditFindings({ vulnerabilities: {} }, [], "2026-11-18")).toEqual([]);
  });
});
