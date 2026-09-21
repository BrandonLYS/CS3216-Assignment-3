"use client";

import { utils } from "animejs";
import { inView, scroll } from "motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { ProductFrame } from "./product-frame";

const VIDEO_SRC = "/landing/vantage-scroll.mp4";
const POSTER_SRC = "/landing/vantage-scroll-poster.jpg";

/** How hard the playhead chases the scroll position, in anime.js `damp` terms: 1 snaps, 0 never moves. */
const SCRUB_FACTOR = 0.14;

const chapters = [
  {
    id: "plan",
    index: "01",
    title: "The plan, stated once",
    body: "Tasks, milestones and dependencies in one Project, with statuses you name yourself and categories the system keeps fixed. Blocked means blocked everywhere.",
  },
  {
    id: "decide",
    index: "02",
    title: "Decisions, and what they rest on",
    body: "Record what was chosen, what was rejected and why. Each Decision carries typed Assumptions - a date, a Person, a Dependency - that the Project itself can later contradict.",
  },
  {
    id: "cite",
    index: "03",
    title: "Evidence down to the passage",
    body: "Plans, minutes and transcripts land as Evidence, split into ordered Passages. A Decision cites the passage it came from, not the whole file.",
  },
  {
    id: "ask",
    index: "04",
    title: "An Assistant on the same base",
    body: "It reads through the same models as the screen and writes through the same services, so every change it makes is an Activity Event. Your own tools reach it over MCP.",
  },
];

export function ScrollVideo() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const railRef = useRef<HTMLSpanElement>(null);
  /** Written every scroll frame, read by the scrub loop - deliberately not state. */
  const progress = useRef(0);
  const [active, setActive] = useState(0);
  const [video, setVideo] = useState<"pending" | "ready" | "missing">("pending");
  const [stacked, setStacked] = useState(false);

  const markReady = useCallback((el: HTMLVideoElement) => {
    setVideo("ready");
    // Safari will not seek a video it has never decoded; prime it with a muted tick.
    void el
      .play()
      .then(() => el.pause())
      .catch(() => {});
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    // Loading finishes long before hydration attaches the handlers below, so settle
    // whatever already happened to the element before trusting its events.
    if (el.error || el.networkState === el.NETWORK_NO_SOURCE) setVideo("missing");
    else if (el.readyState >= el.HAVE_METADATA) markReady(el);
  }, [markReady]);

  useEffect(() => {
    // The pinned text/video composition needs desktop width and enough height to
    // fit below the navigation. Smaller viewports keep every chapter in normal flow.
    const query = window.matchMedia("(prefers-reduced-motion: reduce), (width < 64rem), (height < 40rem)");
    const sync = () => setStacked(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (stacked || !section) return;
    let shown = -1;
    return scroll(
      (p: number) => {
        progress.current = p;
        const rail = railRef.current;
        if (rail) rail.style.transform = `scaleY(${Math.max(p, 0.015)})`;
        const next = Math.min(chapters.length - 1, Math.floor(p * chapters.length));
        if (next !== shown) {
          shown = next;
          setActive(next);
        }
      },
      { target: section, offset: ["start start", "end end"] },
    );
  }, [stacked]);

  useEffect(() => {
    const section = sectionRef.current;
    const el = videoRef.current;
    if (stacked || video !== "ready" || !section || !el) return;

    let frame = 0;
    let last = 0;
    let playhead = el.currentTime;

    const tick = (now: number) => {
      const delta = last ? Math.min(now - last, 50) : 16;
      last = now;
      if (el.duration > 0) {
        playhead = utils.damp(playhead, progress.current * el.duration, delta, SCRUB_FACTOR);
        if (Math.abs(el.currentTime - playhead) > 0.005) el.currentTime = playhead;
      }
      frame = requestAnimationFrame(tick);
    };

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    };

    // Only scrub while the stage is on screen; decoding frames off-screen is pure cost.
    const unwatch = inView(section, () => {
      if (!frame) frame = requestAnimationFrame(tick);
      return stop;
    });

    return () => {
      unwatch();
      stop();
    };
  }, [stacked, video]);

  const stage = (
    <div className="relative overflow-hidden rounded-xl border border-hairline bg-surface-1">
      {video === "missing" ? (
        <div className="flex items-center justify-center p-4 sm:aspect-video sm:p-8">
          <ProductFrame className="w-full max-w-3xl" />
        </div>
      ) : (
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          poster={POSTER_SRC}
          muted
          playsInline
          disablePictureInPicture
          preload="auto"
          aria-hidden
          className="block aspect-video w-full object-cover"
          onLoadedMetadata={(event) => markReady(event.currentTarget)}
          onError={() => setVideo("missing")}
        />
      )}
    </div>
  );

  if (stacked) {
    return (
      <section id="how" className="mx-auto max-w-[1280px] px-6 py-24">
        <Heading />
        <div className="mx-auto mt-10 max-w-4xl">{stage}</div>
        <ol className="mt-10 grid gap-6 sm:grid-cols-2">
          {chapters.map((chapter) => (
            <li key={chapter.id} className="rounded-lg border border-hairline bg-surface-1 p-6">
              <span className="text-eyebrow font-medium text-ink-tertiary">{chapter.index}</span>
              <h3 className="mt-2 text-card-title text-ink">{chapter.title}</h3>
              <p className="mt-2 text-body-sm text-ink-subtle">{chapter.body}</p>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <section id="how">
      <h2 className="sr-only">How it works</h2>
      {/* Four screens of scroll: one per chapter. The stage inside stays pinned. */}
      <div ref={sectionRef} className="relative h-[400vh]">
        <div className="sticky top-0 flex h-screen items-center overflow-hidden">
          <div className="mx-auto grid w-full max-w-[1280px] gap-10 px-6 pt-14 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center lg:gap-12 lg:pt-0">
            <div className="order-2 lg:order-1">{stage}</div>

            <div className="order-1 flex gap-5 lg:order-2">
              <div className="relative hidden w-px shrink-0 bg-hairline lg:block">
                <span
                  ref={railRef}
                  className="absolute inset-0 origin-top bg-primary"
                  style={{ transform: "scaleY(0.015)" }}
                />
              </div>

              <div className="min-w-0">
                <span className="text-eyebrow font-medium tracking-[0.4px] text-ink-tertiary uppercase">
                  How it works
                </span>
                <div className="relative mt-4 grid">
                  {chapters.map((chapter, i) => (
                    <div
                      key={chapter.id}
                      aria-hidden={i !== active}
                      className={cn(
                        "transition-opacity duration-500 [grid-area:1/1]",
                        i === active ? "opacity-100" : "pointer-events-none opacity-0",
                      )}
                    >
                      <span className="text-eyebrow font-medium text-primary">{chapter.index}</span>
                      <h3 className="mt-2 text-headline text-ink">{chapter.title}</h3>
                      <p className="mt-3 max-w-md text-body text-ink-subtle">{chapter.body}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-8 flex gap-1.5">
                  {chapters.map((chapter, i) => (
                    <span
                      key={chapter.id}
                      className={cn(
                        "h-0.5 w-8 rounded-full transition-colors duration-300",
                        i <= active ? "bg-primary" : "bg-hairline-strong",
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Heading() {
  return (
    <>
      <span className="text-eyebrow font-medium tracking-[0.4px] text-ink-tertiary uppercase">How it works</span>
      <h2 className="mt-4 max-w-2xl text-display-md text-ink">From a plan to a record of why</h2>
    </>
  );
}
