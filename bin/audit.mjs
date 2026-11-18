#!/usr/bin/env node
// jgc-audit — website-baseline sec.3 gate: `npm audit --omit=dev`, fail on any high/critical not in .audit-allow.json.
// Exit 0 ok · 1 unlisted high/critical · 2 the audit could not run (never a pass).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { auditFindings, auditRan } from "../dist/security/audit.js";

let raw;
try {
  raw = execFileSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", maxBuffer: 64 << 20 });
} catch (e) {
  raw = e.stdout; // npm audit exits 1 when it finds anything
}
let report;
try {
  report = JSON.parse(raw);
} catch {
  report = null;
}
if (!auditRan(report)) {
  // Fail closed: registry unreachable, no lockfile, auth error… — no report is never "ok".
  console.log(`jgc-audit: npm audit did not produce a report${report?.error ? ` (${report.error.code ?? ""} ${report.error.summary ?? ""})` : ""} — cannot prove the gate`);
  process.exit(2);
}
const allow = existsSync(".audit-allow.json") ? JSON.parse(readFileSync(".audit-allow.json", "utf8")) : [];
const findings = auditFindings(report, allow, new Date().toISOString().slice(0, 10));
for (const f of findings) console.log(`${f.allowed ? "allowed" : "FAIL   "} ${f.severity.padEnd(8)} ${f.id} ${f.pkg}: ${f.title}`);
const bad = findings.filter((f) => !f.allowed);
console.log(bad.length ? `jgc-audit: ${bad.length} high/critical prod advisories` : "jgc-audit: ok");
process.exit(bad.length ? 1 : 0);
