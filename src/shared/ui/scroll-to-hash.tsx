"use client";

import { usePathname, useSearchParams } from "next/navigation";
import * as React from "react";

const HIGHLIGHT = ["ring-1", "ring-primary/40", "rounded-sm"];

/**
 * Scrolls the element named by `location.hash` into view and rings it briefly. Re-runs on
 * mount, on `hashchange`, and on every App Router navigation (which does not fire `hashchange`).
 * DOM work only, no state, so it stays clear of the effect rules.
 */
export function ScrollToHash({ prefix }: { prefix: string }) {
  const pathname = usePathname();
  // Stringified: the params object has a new identity every render and would re-scroll on each one.
  const search = useSearchParams().toString();
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      const id = window.location.hash.slice(1);
      if (!id.startsWith(prefix)) return;
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ block: "center" });
      if (timer) clearTimeout(timer);
      el.classList.add(...HIGHLIGHT);
      timer = setTimeout(() => el.classList.remove(...HIGHLIGHT), 2500);
    };
    run();
    window.addEventListener("hashchange", run);
    return () => {
      window.removeEventListener("hashchange", run);
      if (timer) clearTimeout(timer);
    };
  }, [prefix, pathname, search]);
  return null;
}
