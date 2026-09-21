/** A white beam enters the prism and separates into the six colors of the tag palette. */
export function Logo({
  className,
  size,
  color = (token) => `var(--color-${token})`,
}: {
  className?: string;
  size?: number;
  /** Resolve tokens for image generation, which cannot read CSS variables. */
  color?: (token: string) => string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <rect width="24" height="24" rx="4" fill={color("canvas")} />
      <path d="M1 14 10 11.5" stroke={color("ink")} strokeWidth="1.4" strokeLinecap="round" />
      <path d="m15.5 11 7.5-4v2l-7.5 2.5Z" fill={color("tag-red")} />
      <path d="M15.5 11.5 23 9v2l-7.5 1Z" fill={color("tag-orange")} />
      <path d="m15.5 12 7.5-1v2l-7.5-.5Z" fill={color("tag-yellow")} />
      <path d="m15.5 12.5 7.5.5v2l-7.5-2Z" fill={color("tag-green")} />
      <path d="m15.5 13 7.5 2v2l-7.5-3.5Z" fill={color("tag-blue")} />
      <path d="m15.5 13.5 7.5 3.5v2l-7.5-5Z" fill={color("tag-purple")} />
      <path d="m10 11.5 5.5 1" stroke={color("ink")} strokeWidth=".7" opacity=".7" />
      <path d="m6.5 19 6-14 6 14Z" stroke={color("ink")} strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}
