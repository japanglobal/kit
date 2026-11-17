import { describe, expect, it, vi } from "vitest";
import { createTrackRoute } from "../src/consent/server.js";
import { cookie } from "./fixtures.js";

const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://x.test/api/track", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers });
const withCookie = { cookie: `cc_cookie=${cookie({ expirationTime: Date.now() + 1e10 })}`, "x-vercel-ip-country": "JP" };

function route(member: string | null = null) {
  const capture = vi.fn();
  const flush = vi.fn(async () => undefined);
  return { capture, flush, POST: createTrackRoute({ posthog: { capture, flush }, appId: "zucity", getMemberId: () => member }) };
}

describe("createTrackRoute", () => {
  it.each(["purchase", "refund", "sign_up", "stay_redeemed", "referral_attributed", "add_to_cart", "$pageview", "", 5])(
    "rejects %s (no forged commerce facts)",
    async (name) => {
      const r = route("m1");
      expect((await r.POST(req({ name }, withCookie))).status).toBe(400);
      expect(r.capture).not.toHaveBeenCalled();
    },
  );

  it.each([
    "not json",
    { name: "logout", props: [] },
    { name: "logout", props: { $set: 1 } },
    { name: "logout", props: { a: { nested: 1 } } },
    { name: "logout", props: { a: "x".repeat(300) } },
    { name: "logout", props: { a: [1] } },
    { name: "logout", uuid: "nope" },
  ])("rejects malformed body %#", async (body) => {
    const r = route("m1");
    expect((await r.POST(req(body, withCookie))).status).toBe(400);
  });

  it("anonymous consent_updated: facts from the cookie, no person profile", async () => {
    const r = route(null);
    const res = await r.POST(req({ name: "consent_updated", props: { source: "banner", gpc: false, personalization: false } }, withCookie));
    expect(res.status).toBe(204);
    const msg = r.capture.mock.calls[0]![0];
    expect(msg.distinctId).toBe("0b6f6c64-2b0e-4b8e-9a51-6b8c4c9a1f00");
    expect(msg.properties).toMatchObject({ personalization: true, partners: false, v: 1, country: "JP", app_id: "zucity", $process_person_profile: false });
    expect(msg.properties.$set).toBeUndefined();
    expect(r.flush).toHaveBeenCalled();
  });

  it("member consent_updated sets person props", async () => {
    const r = route("m1");
    await r.POST(req({ name: "consent_updated", props: { source: "settings" } }, withCookie));
    const msg = r.capture.mock.calls[0]![0];
    expect(msg.distinctId).toBe("m1");
    expect(msg.properties.$set).toEqual({ consent_personalization: true, consent_partners: false, consent_v: 1 });
    expect(msg.properties.$process_person_profile).toBeUndefined();
  });

  it("consent_updated without a valid cookie, login without a member: 400", async () => {
    expect((await route("m1").POST(req({ name: "consent_updated" }))).status).toBe(400);
    expect((await route(null).POST(req({ name: "login" }, withCookie))).status).toBe(400);
  });
});
