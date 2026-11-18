"use client";
/**
 * <GoogleTagManager/> — loads the site's GTM container (NEXT_PUBLIC_GTM_ID, or the `id` prop) only while
 * `category` (default Personalization) is granted. The container needs only its Google tag (GA4 config):
 * `dataLayerSink` / `setUserId` push gtag commands it executes with zero GTM setup; the container's Meta Pixel
 * tag is Meta's only path (the kit ships no Meta code). Withdrawal reloads the page (consent config), so a loaded
 * container never outlives the consent. Unset or malformed id ⇒ renders nothing.
 */
import { useEffect } from "react";
import type { OptionalCategory, ReadOptions } from "../consent/core.js";
import { useConsent } from "../consent/react.js";
import { GTM_ID_RE, kitEnv, missing } from "../env.js";
import { CONSENT_GRANTED, dataLayer, gtag } from "./datalayer.js";

export { GTM_ID_RE };

export function GoogleTagManager({
  id: idProp,
  category = "personalization",
  read,
}: {
  /** Default: NEXT_PUBLIC_GTM_ID; null = off. */
  id?: string | null;
  category?: OptionalCategory;
  read?: ReadOptions;
}): null {
  const id = idProp === undefined ? kitEnv().gtmId : idProp;
  const valid = !!id && GTM_ID_RE.test(id);
  const granted = useConsent(read)?.[category] ?? false;
  const off = idProp === null;
  useEffect(() => {
    if (!valid && !off) missing("NEXT_PUBLIC_GTM_ID", "Google Tag Manager");
  }, [valid, off]);
  useEffect(() => {
    if (!granted || !valid || !id) return;
    if (document.getElementById(`gtm-${id}`)) return;
    gtag("consent", "default", CONSENT_GRANTED);
    dataLayer()?.push({ "gtm.start": Date.now(), event: "gtm.js" });
    const s = document.createElement("script");
    s.id = `gtm-${id}`;
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(s);
  }, [granted, valid, id]);
  return null;
}
