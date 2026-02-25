"use client";

import { useEffect } from "react";

function setHeadIcon(rel: string, href: string) {
  let el = document.querySelector(`link[rel='${rel}']`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

export function FaviconSync() {
  useEffect(() => {
    let canceled = false;

    async function sync() {
      try {
        const res = await fetch("/api/public/site-settings", { cache: "no-store" });
        const j = await res.json().catch(() => null);
        const logo = String(j?.data?.siteLogoDataUrl || "").trim();
        const href = /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(logo) ? logo : "/favicon.ico";
        if (canceled) return;

        setHeadIcon("icon", href);
        setHeadIcon("shortcut icon", href);
        setHeadIcon("apple-touch-icon", href);
      } catch {
        // ignore
      }
    }

    sync();
    return () => {
      canceled = true;
    };
  }, []);

  return null;
}
