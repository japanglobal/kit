"use client";
/**
 * <GoogleTagManager id/> — loads the site's GTM container only while `category` (default Personalization) is
 * granted. GA4, Ads and Meta live as tags inside the container; the site pushes events with `dataLayerSink`.
 * Withdrawal reloads the page (consent config), so a loaded container never outlives the consent.
 */
import { useEffect } from "react";
import type { OptionalCategory, ReadOptions } from "../consent/core.js";
import { useConsent } from "../consent/react.js";
import { CONSENT_GRANTED, dataLayer, gtag } from "./datalayer.js";

export const GTM_ID_RE = /^GTM-[A-Z0-9]{4,12}$/;

export function GoogleTagManager({
  id,
  category = "personalization",
  read,
}: {
  id: string | null | undefined;
  category?: OptionalCategory;
  read?: ReadOptions;
}): null {
  const granted = useConsent(read)?.[category] ?? false;
  useEffect(() => {
    if (!granted || !id || !GTM_ID_RE.test(id)) return;
    if (document.getElementById(`gtm-${id}`)) return;
    gtag("consent", "default", CONSENT_GRANTED);
    dataLayer()?.push({ "gtm.start": Date.now(), event: "gtm.js" });
    const s = document.createElement("script");
    s.id = `gtm-${id}`;
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(s);
  }, [granted, id]);
  return null;
}
