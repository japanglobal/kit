// @vitest-environment jsdom
import { act, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const run = vi.fn(async (_config: unknown) => undefined);
const showPreferences = vi.fn();
const setLanguage = vi.fn(async () => true);
vi.mock("vanilla-cookieconsent", () => ({ run, showPreferences, setLanguage }));

import { Consent, ConsentGate, CookieSettingsButton, useConsent } from "../src/consent/react.js";
import { LegalLinks, CookieTable } from "../src/legal/react.js";
import { cookie, VENDORS } from "./fixtures.js";

const setCookie = (v: string) => {
  document.cookie = `cc_cookie=${v}; path=/`;
};
afterEach(() => {
  document.cookie = "cc_cookie=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

function Probe() {
  const c = useConsent({ revision: 1 });
  return <span data-testid="p">{c ? String(c.personalization) : "none"}</span>;
}

describe("react consent", () => {
  it("useConsent follows cc:onChange; ConsentGate renders only when granted", () => {
    render(
      <>
        <Probe />
        <ConsentGate category="personalization">
          <i data-testid="tag" />
        </ConsentGate>
      </>,
    );
    expect(screen.getByTestId("p").textContent).toBe("none");
    expect(screen.queryByTestId("tag")).toBeNull();
    act(() => {
      setCookie(cookie({ expirationTime: Date.now() + 1e10 }));
      window.dispatchEvent(new Event("cc:onChange"));
    });
    expect(screen.getByTestId("p").textContent).toBe("true");
    expect(screen.getByTestId("tag")).toBeTruthy();
  });

  it("<Consent/> runs the banner once with the JGC config", async () => {
    render(<Consent config={{ appName: "ZuCity", lang: "ja", links: { privacy: "/{lang}/legal/privacy", cookies: "/{lang}/legal/cookies" }, contact: "x", vendors: VENDORS }} />);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const cfg = run.mock.calls[0]![0] as unknown as { language: { default: string }; cookie: { expiresAfterDays: number } };
    expect(cfg.language.default).toBe("ja");
    expect(cfg.cookie.expiresAfterDays).toBe(365);
  });

  it("CookieSettingsButton and LegalLinks reopen preferences", async () => {
    render(<LegalLinks lang="en" tokushoho />);
    expect(screen.getByText("Specified Commercial Transactions Act").getAttribute("href")).toBe("/en/legal/tokushoho");
    fireEvent.click(screen.getByText("Cookie settings"));
    await vi.waitFor(() => expect(showPreferences).toHaveBeenCalled());
    render(<CookieSettingsButton>x</CookieSettingsButton>);
  });

  it("CookieTable lists vendors per category in the page language", () => {
    render(<CookieTable lang="ja" vendors={VENDORS} />);
    expect(screen.getByText("アクセス解析")).toBeTruthy();
    expect(screen.getByText("ph_*")).toBeTruthy();
    expect(screen.queryByText("tokushoho")).toBeNull();
  });
});
