"use client";
/**
 * <MetaPixel/> — installs the Meta Pixel (NEXT_PUBLIC_META_PIXEL_ID, or the `id` prop) only while
 * `category` (default Personalization) is granted: fbevents.js, `fbq('init', id)`, `PageView`. Once per
 * page; client route changes are counted by fbevents.js itself (history.pushState). Withdrawal reloads
 * the page (consent config), so a loaded pixel never outlives the consent. Unset or malformed id ⇒ nothing.
 */
import { useEffect } from "react";
import type { OptionalCategory, ReadOptions } from "../consent/core.js";
import { useConsent } from "../consent/react.js";
import { kitEnv } from "../env.js";
import { installMetaPixel } from "./index.js";

export function MetaPixel({
  id: idProp,
  category = "personalization",
  read,
}: {
  /** Default: NEXT_PUBLIC_META_PIXEL_ID; null = off. */
  id?: string | null;
  category?: OptionalCategory;
  read?: ReadOptions;
}): null {
  const id = idProp === undefined ? kitEnv().metaPixelId : idProp;
  const granted = useConsent(read)?.[category] ?? false;
  useEffect(() => {
    if (granted && id) installMetaPixel(id);
  }, [granted, id]);
  return null;
}
