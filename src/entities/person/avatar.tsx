import { cn } from "@/shared/lib/cn";

const PALETTE = ["primary", "tag-blue", "tag-green", "tag-orange", "tag-purple", "tag-red", "tag-yellow"].map(
  (t) => `var(--color-${t})`,
);

function hue(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export function Avatar({
  name,
  size = "sm",
  className,
}: {
  name?: string | null;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const dim = size === "xs" ? "size-4 text-[9px]" : size === "sm" ? "size-5 text-[10px]" : "size-7 text-caption";
  if (!name) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 rounded-full border border-dashed border-hairline-tertiary",
          dim,
          className,
        )}
        title="Unassigned"
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white",
        dim,
        className,
      )}
      style={{ background: hue(name) }}
      title={name}
    >
      {initials}
    </span>
  );
}
