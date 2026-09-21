"use client";

import { animate, inView, stagger } from "motion";
import { useEffect, useRef } from "react";
import { cn } from "@/shared/lib/cn";

/**
 * Lifts its children into view the first time the wrapper is scrolled to. Children opt
 * in with `data-reveal`; without JS, or under reduced motion, they render in their
 * resting state, so nothing can get stuck invisible.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const targets = root.querySelectorAll<HTMLElement>("[data-reveal]");
    if (targets.length === 0) return;

    for (const el of targets) {
      el.style.opacity = "0";
      el.style.transform = "translateY(14px)";
    }

    let played = false;
    let stop = () => {};
    stop = inView(
      root,
      () => {
        if (played) return;
        played = true;
        void animate(
          targets,
          { opacity: [0, 1], y: [14, 0] },
          { duration: 0.65, delay: stagger(0.08, { startDelay: delay }), ease: [0.16, 1, 0.3, 1] },
        );
        stop();
      },
      { amount: 0.2, margin: "0px 0px -10% 0px" },
    );

    return () => stop();
  }, [delay]);

  return (
    <div ref={ref} className={cn(className)}>
      {children}
    </div>
  );
}
