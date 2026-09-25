"use client";

import { animate, createDrawable, stagger, utils } from "animejs";
import { inView } from "motion";
import { useEffect, useRef } from "react";

/** `kindBelow` keeps the bottom node's label clear of the edges arriving above it. */
const nodes = [
  { x: 96, y: 40, label: "Kickoff minutes", kind: "Evidence", kindBelow: false },
  { x: 40, y: 132, label: "Dual-run, not cutover", kind: "Decision", kindBelow: false },
  { x: 208, y: 132, label: "UAT begins 25 Sep", kind: "Assumption", kindBelow: false },
  { x: 124, y: 224, label: "Vendor access delay", kind: "Risk", kindBelow: true },
];

const edges = [
  "M96 56 C 96 90, 46 96, 42 118",
  "M96 56 C 96 90, 202 96, 206 118",
  "M46 146 C 52 190, 108 196, 118 210",
  "M204 146 C 198 190, 142 196, 130 210",
];

/**
 * The shape of one record in PrismPM: the evidence above, the decision and the assumption
 * it rests on in the middle, the consequence below. anime.js draws the edges in on scroll,
 * then the nodes land.
 */
export function DecisionTrace() {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const edges = createDrawable(svg.querySelectorAll("[data-edge]"));
    const nodes = svg.querySelectorAll<SVGGElement>("[data-node]");

    // Hidden from JS rather than from the markup, so the diagram is whole without it.
    utils.set(edges, { draw: "0 0" });
    utils.set(nodes, { opacity: 0 });

    const drawn = animate(edges, {
      draw: ["0 0", "0 1"],
      duration: 900,
      delay: stagger(140),
      ease: "inOut(2)",
      autoplay: false,
    });

    const landed = animate(nodes, {
      opacity: [0, 1],
      scale: [0.9, 1],
      duration: 600,
      delay: stagger(140, { start: 260 }),
      ease: "out(3)",
      autoplay: false,
    });

    let stop = () => {};
    stop = inView(
      svg,
      () => {
        drawn.play();
        landed.play();
        stop();
      },
      { amount: 0.3 },
    );

    return () => {
      stop();
      drawn.revert();
      landed.revert();
    };
  }, []);

  return (
    <svg ref={ref} viewBox="-24 0 296 274" className="h-auto w-full max-w-[440px]" role="img">
      <title>A decision, the evidence it cites, the assumption it rests on and the risk that follows</title>
      {edges.map((d) => (
        <path
          key={d}
          data-edge
          d={d}
          fill="none"
          stroke="var(--color-hairline-strong)"
          strokeWidth="1"
          strokeLinecap="round"
        />
      ))}
      {nodes.map((node, i) => (
        <g key={node.label} data-node style={{ transformOrigin: `${node.x}px ${node.y}px` }}>
          <circle
            cx={node.x}
            cy={node.y}
            r="5"
            fill={i === 1 ? "var(--color-primary)" : "var(--color-surface-3)"}
            stroke={i === 1 ? "var(--color-primary)" : "var(--color-ink-tertiary)"}
            strokeWidth="1"
          />
          <text
            x={node.x}
            y={node.kindBelow ? node.y + 30 : node.y - 12}
            textAnchor="middle"
            className="fill-ink-tertiary font-mono text-[7px] tracking-[0.4px] uppercase"
          >
            {node.kind}
          </text>
          <text x={node.x} y={node.y + 18} textAnchor="middle" className="fill-ink-muted text-[8px]">
            {node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
