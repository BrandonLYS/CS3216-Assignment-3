const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g;

/** Plain-text Comment body: line breaks preserved, URLs clickable. No Markdown. */
export function CommentBody({ body }: { body: string }) {
  const parts = body.split(URL_RE);
  return (
    <p className="text-body-sm break-words whitespace-pre-wrap text-ink">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </p>
  );
}
