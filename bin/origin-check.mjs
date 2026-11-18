#!/usr/bin/env node
// jgc-origin-check <domain> [path] — website-baseline sec.7 falsifier: the Vercel origin must refuse a request that
// skips Cloudflare. Through DNS: expect `server: cloudflare`. Straight at Vercel's edge IPs with Host/SNI = domain:
// every one must answer 403 (the WAF deny). Fail closed — an answer we could not get is never "locked":
//   0 = locked (every direct request got a 4xx/5xx) · 0 = domain has no DNS record (public resolvers agree: not live)
//   1 = ORIGIN OPEN (a direct request got < 400) · 2 = could not prove either (DNS or network error, no Vercel IP).
import { request } from "node:https";
import { Resolver } from "node:dns/promises";
import { originVerdict } from "../dist/security/origin.js";

const [domain, path = "/"] = process.argv.slice(2);
if (!domain) {
  console.error("usage: jgc-origin-check <domain> [path]");
  process.exit(2);
}

// Public resolvers, not the host's: an offline or captive local resolver must not read as "no record".
const dns = new Resolver({ timeout: 5000, tries: 2 });
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const NO_RECORD = new Set(["ENOTFOUND", "ENODATA"]);
async function records(name) {
  const out = await Promise.allSettled([dns.resolve4(name), dns.resolve6(name), dns.resolveCname(name)]);
  const errs = out.filter((r) => r.status === "rejected").map((r) => r.reason.code);
  const found = out.some((r) => r.status === "fulfilled" && r.value.length);
  return { found, hardError: errs.find((c) => !NO_RECORD.has(c)) };
}

const own = await records(domain);
if (!own.found) {
  const v = originVerdict(own, []);
  console.log(`${domain}: ${v.why}`);
  process.exit(v.code);
}

const get = (ip) =>
  new Promise((ok) => {
    const lookup = (_h, o, cb) => (o?.all ? cb(null, [{ address: ip, family: 4 }]) : cb(null, ip, 4));
    const req = request({ host: domain, servername: domain, path, method: "GET", timeout: 10_000, agent: false, ...(ip ? { lookup } : {}) }, (res) => {
      res.resume();
      ok({ status: res.statusCode, server: res.headers.server ?? "", cfRay: Boolean(res.headers["cf-ray"]) });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => ok({ error: e.code ?? e.message }));
    req.end();
  });

const viaDns = await get(null);
console.log(`via DNS: ${viaDns.error ?? `${viaDns.status} server=${viaDns.server}${viaDns.cfRay ? " cf-ray" : ""}`}`);
if (!viaDns.error && !/cloudflare/i.test(viaDns.server)) console.log("note: DNS does not route through Cloudflare (proxy off?)");

const resolved = await dns.resolve4("cname.vercel-dns.com").catch((e) => {
  console.log(`note: cname.vercel-dns.com lookup failed (${e.code}); using the fixed Vercel IPs only`);
  return [];
});
const vercel = [...new Set(["76.76.21.21", "216.198.79.1", ...resolved])];
const direct = [];
for (const ip of vercel) {
  const r = await get(ip);
  direct.push(r.error ? { error: r.error } : { status: r.status });
  const note = r.error ? "← no answer (not proof of a lock)" : r.status < 400 ? "← ORIGIN OPEN (bypasses Cloudflare)" : "";
  console.log(`direct ${ip}: ${r.error ?? `${r.status} server=${r.server}`}  ${note}`);
}
const v = originVerdict(own, direct);
console.log(`${domain}: ${v.code === 0 ? "origin locked" : v.code === 1 ? "ORIGIN OPEN" : "cannot prove the lock"} (${v.why})`);
process.exit(v.code);
