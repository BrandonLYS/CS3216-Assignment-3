import Link from "next/link";
import * as React from "react";

export type TextChunk = { type: "text"; text: string } | { type: "link"; label: string; href: string };

const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/** Same-app paths only: no scheme, no protocol-relative `//`, so a model cannot send the User elsewhere. */
export const isInternalHref = (href: string) => href.startsWith("/") && !href.startsWith("//");

/**
 * Models sometimes "absolutise" a relative href with an invented host. Keep only the in-app
 * part (path, query, hash) of an http(s) URL whose path is an app route; anything else is null.
 */
export function internalHref(href: string): string | null {
  if (isInternalHref(href)) return href;
  if (!/^https?:\/\//i.test(href)) return null;
  try {
    const u = new URL(href);
    return u.pathname.startsWith("/projects/") ? `${u.pathname}${u.search}${u.hash}` : null;
  } catch {
    return null;
  }
}

/** Split Assistant text into plain runs and internal Markdown links; anything else stays literal text. */
export function splitLinks(text: string): TextChunk[] {
  const out: TextChunk[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    const [whole, label, raw] = m as unknown as [string, string, string];
    const start = m.index ?? 0;
    const href = internalHref(raw);
    if (!href) continue;
    if (start > last) out.push({ type: "text", text: text.slice(last, start) });
    out.push({ type: "link", label, href });
    last = start + whole.length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

/** Assistant text with clickable citations (issue #40). Links open in-app dialogs via their query params. */
export function LinkedText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap">
      {splitLinks(text).map((c, i) =>
        c.type === "text" ? (
          <React.Fragment key={i}>{c.text}</React.Fragment>
        ) : (
          <Link key={i} href={c.href} className="text-primary underline decoration-primary/40 hover:decoration-primary">
            {c.label}
          </Link>
        ),
      )}
    </p>
  );
}
