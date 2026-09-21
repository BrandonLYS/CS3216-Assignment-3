"use client";

import { utils } from "animejs";
import { inView, scroll } from "motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { ProductFrame } from "./product-frame";

const VIDEO_SRC = "/landing/prismpm-scroll.mp4";
const POSTER_SRC = "/landing/prismpm-scroll-poster.jpg";

/** How hard the playhead chases the scroll position, in anime.js `damp` terms: 1 snaps, 0 never moves. */
const SCRUB_FACTOR = 0.14;

/**
 * One beat of the descent, from the plan view above the tower down into a single room.
 * Each pairs the shot it sits over with the part of Vantage that shot stands for.
 */
const chapters = [
  {
    id: "plan",
    index: "01",
    eyebrow: "Plan view",
    title: "Stand above the whole thing",
    body: "Every Project, every Task, every Risk on one surface. The workspace opens on what needs you today, not on a list you have to read first.",
  },
  {
    id: "structure",
    index: "02",
    eyebrow: "Elevation",
    title: "The outline has depth",
    body: "Tilt the plan and the structure shows: Milestones that Tasks roll up to, Dependencies holding one thing behind another, dates that carry weight.",
  },
  {
    id: "load",
    index: "03",
    eyebrow: "Structure",
    title: "Decisions are load-bearing",
    body: "Each one rests on typed Assumptions - a date, a Person, a Dependency. When the Project contradicts one, it stops holding and says so.",
  },
  {
    id: "room",
    index: "04",
    eyebrow: "Interior",
    title: "Down to the single room",
    body: "Open any Task and its whole history is there: which field changed, from what, to what, by whom, and when. Nothing is summarised away.",
  },
  {
    id: "links",
    index: "05",
    eyebrow: "Circulation",
    title: "Everything is wired to everything",
    body: "Evidence cites the passage it came from. The Assistant reads and writes through the same services you do, so nothing moves without leaving a record.",
  },
];

type VideoState = "pending" | "ready" | "missing";

export function ScrollVideo() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const railRef = useRef<HTMLSpanElement>(null);
  /** Written every scroll frame, read by the scrub loop - deliberately not state. */
  const progress = useRef(0);
  const [active, setActive] = useState(0);
  const [video, setVideo] = useState<VideoState>("pending");
  const [narrow, setNarrow] = useState(false);

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
    // The pinned descent needs a viewport tall enough to hold a full shot, and it is
    // the wrong idea entirely for someone who asked for less motion.
    const query = window.matchMedia("(prefers-reduced-motion: reduce), (height < 34rem)");
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  /** The pinned shot only earns the screen when there is a shot to pin. */
  const cinema = !narrow && video !== "missing";

  useEffect(() => {
    const section = sectionRef.current;
    if (!cinema || !section) return;
    let shown = -1;
    return scroll(
      (p: number) => {
        progress.current = p;
        const rail = railRef.current;
        if (rail) rail.style.transform = `scaleX(${Math.max(p, 0.004)})`;
        const next = Math.min(chapters.length - 1, Math.floor(p * chapters.length));
        if (next !== shown) {
          shown = next;
          setActive(next);
        }
      },
      { target: section, offset: ["start start", "end end"] },
    );
  }, [cinema]);

  useEffect(() => {
    const section = sectionRef.current;
    const el = videoRef.current;
    if (!cinema || video !== "ready" || !section || !el) return;

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
  }, [cinema, video]);

  const film = (
    <video
      ref={videoRef}
      src={VIDEO_SRC}
      poster={POSTER_SRC}
      muted
      playsInline
      disablePictureInPicture
      preload="auto"
      aria-hidden
      className={cn("h-full w-full object-cover", cinema ? "absolute inset-0" : "block aspect-video")}
      onLoadedMetadata={(event) => markReady(event.currentTarget)}
      onError={() => setVideo("missing")}
    />
  );

  if (!cinema) {
    return (
      <section id="how" className="mx-auto max-w-[1280px] px-6 py-24">
        <span className="text-eyebrow font-medium tracking-[0.4px] text-ink-tertiary uppercase">The descent</span>
        <h2 className="mt-4 max-w-2xl text-display-md text-ink">From the plan view down to the single room</h2>
        <div className="mx-auto mt-10 max-w-4xl overflow-hidden rounded-xl border border-hairline bg-surface-1">
          {video === "missing" ? (
            <div className="flex items-center justify-center p-4 sm:aspect-video sm:p-8">
              <ProductFrame className="w-full max-w-3xl" />
            </div>
          ) : (
            film
          )}
        </div>
        <ol className="mt-10 grid gap-6 sm:grid-cols-2">
          {chapters.map((chapter) => (
            <li key={chapter.id} className="rounded-lg border border-hairline bg-surface-1 p-6">
              <span className="text-eyebrow font-medium text-ink-tertiary">
                {chapter.index} &middot; {chapter.eyebrow}
              </span>
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
      <h2 className="sr-only">From the plan view down to the single room</h2>
      {/* One screen of scroll per beat. The shot inside stays pinned for all of them. */}
      <div ref={sectionRef} className="relative" style={{ height: `${chapters.length * 100}vh` }}>
        <div className="sticky top-0 h-screen w-full overflow-hidden bg-canvas">
          {film}

          {/* Legibility, and edges that dissolve into the canvas rather than stopping at a line. */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, var(--color-canvas) 0%, color-mix(in srgb, var(--color-canvas) 88%, transparent) 26%, color-mix(in srgb, var(--color-canvas) 45%, transparent) 48%, transparent 70%), linear-gradient(to bottom, var(--color-canvas) 0%, transparent 20%)",
            }}
          />

          <div className="relative flex h-full flex-col justify-end">
            {/* A floor indicator down the right edge: where in the descent you are. */}
            <ol
              aria-hidden
              className="absolute top-1/2 right-6 hidden -translate-y-1/2 flex-col items-end gap-4 lg:flex"
            >
              {chapters.map((chapter, i) => (
                <li
                  key={chapter.id}
                  className={cn(
                    "flex items-center gap-3 text-eyebrow font-medium tracking-[0.4px] transition-colors duration-500",
                    i === active ? "text-ink" : "text-ink-tertiary",
                  )}
                >
                  <span
                    className={cn(
                      "h-px transition-all duration-500",
                      i === active ? "w-8 bg-primary" : "w-4 bg-hairline-tertiary",
                    )}
                  />
                  {chapter.index}
                </li>
              ))}
            </ol>

            <div className="mx-auto w-full max-w-[1280px] px-6 pb-20 sm:pb-24">
              <div className="grid max-w-2xl">
                {chapters.map((chapter, i) => (
                  <div
                    key={chapter.id}
                    aria-hidden={i !== active}
                    className={cn(
                      "transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] [grid-area:1/1]",
                      i === active ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
                    )}
                  >
                    <span className="flex items-center gap-3 text-eyebrow font-medium tracking-[0.4px] uppercase">
                      <span className="text-primary">{chapter.index}</span>
                      <span className="h-px w-8 bg-hairline-tertiary" />
                      <span className="text-ink-subtle">{chapter.eyebrow}</span>
                    </span>
                    <h3 className="mt-5 text-display-md text-ink">{chapter.title}</h3>
                    <p className="mt-4 max-w-lg text-body-lg text-ink-muted">{chapter.body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative h-px w-full bg-hairline">
              <span
                ref={railRef}
                className="absolute inset-0 origin-left bg-primary"
                style={{ transform: "scaleX(0.004)" }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
