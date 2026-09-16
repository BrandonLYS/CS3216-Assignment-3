const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g;

export const LINK_TEXT_MAX = 60;

/** Code-point-safe display text for a link: the full URL stays in `href`/`title`. */
export function linkText(url: string): string {
  const chars = Array.from(url);
  return chars.length > LINK_TEXT_MAX ? `${chars.slice(0, LINK_TEXT_MAX - 1).join("")}…` : url;
}

/** Plain-text Comment body: line breaks preserved, URLs clickable. No Markdown. */
export function CommentBody({ body }: { body: string }) {
  const parts = body.split(URL_RE);
  return (
    <p className="text-body-sm break-words whitespace-pre-wrap text-ink">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            title={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {linkText(part)}
          </a>
        ) : (
          part
        ),
      )}
    </p>
  );
}
