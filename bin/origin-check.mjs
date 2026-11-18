#!/usr/bin/env node
// jgc-origin-check <domain> [path] — website-baseline sec.7 falsifier: the Vercel origin must refuse a request that
// skips Cloudflare. Through DNS: expect `server: cloudflare`. Straight at Vercel's edge IPs with Host/SNI = domain:
// expect 403. Exit 1 when the origin answers directly; 0 when the domain has no DNS record; 2 when unreachable.
import { request } from "node:https";
import { resolve4 } from "node:dns/promises";

const [domain, path = "/"] = process.argv.slice(2);
if (!domain) {
  console.error("usage: jgc-origin-check <domain> [path]");
  process.exit(2);
}
const get = (ip) =>
  new Promise((ok) => {
    const req = request(
      { host: domain, servername: domain, path, method: "GET", timeout: 10_000, agent: false, ...(ip ? { lookup: (_h, o, cb) => (o?.all ? cb(null, [{ address: ip, family: 4 }]) : cb(null, ip, 4)) } : {}) },
      (res) => {
        res.resume();
        ok({ status: res.statusCode, server: res.headers.server ?? "", cfRay: Boolean(res.headers["cf-ray"]) });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => ok({ error: e.message }));
    req.end();
  });

const viaDns = await get(null);
if (viaDns.error) {
  // Only a domain with no DNS record is "not live"; any other failure is an error, never a pass.
  const notLive = /ENOTFOUND/.test(viaDns.error);
  console.log(`${domain}: ${notLive ? "no DNS record — not live, nothing to check" : `unreachable (${viaDns.error})`}`);
  process.exit(notLive ? 0 : 2);
}
console.log(`via DNS: ${viaDns.status} server=${viaDns.server}${viaDns.cfRay ? " cf-ray" : ""}`);
const vercel = new Set(["76.76.21.21", "216.198.79.1", ...(await resolve4("cname.vercel-dns.com").catch(() => []))]);
let open = 0;
for (const ip of vercel) {
  const r = await get(ip);
  const bypass = !r.error && r.status < 400;
  open += bypass ? 1 : 0;
  console.log(`direct ${ip}: ${r.error ?? `${r.status} server=${r.server}`}${bypass ? "  ← ORIGIN OPEN (bypasses Cloudflare)" : ""}`);
}
if (!/cloudflare/i.test(viaDns.server)) console.log("note: DNS does not route through Cloudflare (proxy off?)");
process.exit(open ? 1 : 0);
