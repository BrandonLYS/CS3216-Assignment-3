"use client";

import { scroll } from "motion";
import { useEffect, useRef, type RefObject } from "react";

const bands = ["tag-red", "tag-orange", "tag-yellow", "tag-green", "tag-blue", "tag-purple"] as const;

/** Where the beam leaves the prism, in the SVG's 1440 x 900 space. */
const EXIT = { x: 846, y: 408 };

/** Soft pools of colour behind the hero, each drifting on its own clock. */
const washes = [
  { color: "primary", mix: 55, x: "50%", y: "18%", size: "70vmax", delay: "0s" },
  { color: "tag-purple", mix: 45, x: "12%", y: "62%", size: "55vmax", delay: "-6s" },
  { color: "tag-blue", mix: 35, x: "30%", y: "95%", size: "50vmax", delay: "-11s" },
  { color: "tag-orange", mix: 28, x: "92%", y: "40%", size: "45vmax", delay: "-3s" },
  { color: "tag-red", mix: 22, x: "80%", y: "85%", size: "40vmax", delay: "-14s" },
];

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * The hero's backdrop: a white beam through a prism, split into the brand spectrum over a
 * wash of the same colours. As the hero scrolls away the spectrum folds back into the
 * prism and the colour drains to the canvas, so the page arrives at the prism film in black.
 */
export function HeroSpectrum({
  heroRef,
  contentRef,
}: {
  heroRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
}) {
  const washRef = useRef<HTMLDivElement>(null);
  const fanRef = useRef<SVGGElement>(null);
  const prismRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    return scroll(
      (p: number) => {
        // Colour drains over the first two thirds of the hero's exit; the page is black by the time it has gone.
        const drain = clamp01(p / 0.7);
        const wash = washRef.current;
        if (wash) wash.style.opacity = String(1 - drain);

        const fan = fanRef.current;
        if (fan) {
          const fold = clamp01(p / 0.6);
          fan.style.opacity = String(1 - fold);
          if (!still) fan.style.transform = `scaleY(${1 - 0.92 * fold})`;
        }
        const prism = prismRef.current;
        if (prism) prism.style.opacity = String(1 - clamp01((p - 0.2) / 0.5));

        const content = contentRef.current;
        if (content && !still) {
          content.style.transform = `translateY(${-p * 120}px)`;
          content.style.opacity = String(1 - clamp01((p - 0.1) / 0.55));
        }
      },
      { target: hero, offset: ["start start", "end start"] },
    );
  }, [heroRef, contentRef]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      style={{
        // The hero's lower edge dissolves into the canvas, so there is never a line where the colour stops.
        maskImage: "linear-gradient(to bottom, black 70%, transparent)",
        WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent)",
      }}
    >
      <div ref={washRef} className="absolute inset-0">
        {washes.map((w) => (
          <div
            key={w.color}
            className="landing-drift absolute rounded-full blur-3xl"
            style={{
              left: w.x,
              top: w.y,
              width: w.size,
              height: w.size,
              marginLeft: `calc(${w.size} / -2)`,
              marginTop: `calc(${w.size} / -2)`,
              background: `radial-gradient(circle, color-mix(in srgb, var(--color-${w.color}) ${w.mix}%, transparent) 0%, transparent 65%)`,
              animationDelay: w.delay,
            }}
          />
        ))}
      </div>

      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <filter id="hero-soft" filterUnits="userSpaceOnUse" x="-40" y="-40" width="1520" height="980">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <linearGradient id="hero-beam" x1="0" x2="1">
            <stop offset="0" stopColor="var(--color-ink)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--color-ink)" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="hero-fan-fade" x1="0" x2="1">
            <stop offset="0" stopColor="white" stopOpacity="1" />
            <stop offset="1" stopColor="white" stopOpacity="0.35" />
          </linearGradient>
          <mask id="hero-fan-mask">
            <rect x={EXIT.x} y="0" width={1440 - EXIT.x} height="900" fill="url(#hero-fan-fade)" />
          </mask>
        </defs>

        {/* The spectrum, closing back into a single line as the hero leaves. */}
        <g
          ref={fanRef}
          mask="url(#hero-fan-mask)"
          style={{ transformOrigin: `${EXIT.x}px ${EXIT.y}px`, transformBox: "view-box" }}
        >
          <g filter="url(#hero-soft)" opacity="0.55">
            {bands.map((band, i) => (
              <path
                key={band}
                d={`M${EXIT.x} ${EXIT.y + i * 2.5} L1460 ${190 + i * 95} L1460 ${190 + (i + 1) * 95} L${EXIT.x} ${EXIT.y + (i + 1) * 2.5} Z`}
                fill={`var(--color-${band})`}
              />
            ))}
          </g>
        </g>

        <g ref={prismRef}>
          {/* The white beam, entering from the left edge. */}
          <path d="M-20 480 L604 392" stroke="url(#hero-beam)" strokeWidth="5" filter="url(#hero-soft)" />
          <path d="M-20 480 L604 392" stroke="url(#hero-beam)" strokeWidth="1.5" />
          <path d="M604 392 L846 410" stroke="var(--color-ink)" strokeOpacity="0.5" strokeWidth="1.2" />
          {/* The prism: a large, quiet outline behind the headline. */}
          <path
            d="M720 150 L930 580 L510 580 Z"
            fill="color-mix(in srgb, var(--color-ink) 3%, transparent)"
            stroke="var(--color-ink)"
            strokeOpacity="0.28"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </div>
  );
}
