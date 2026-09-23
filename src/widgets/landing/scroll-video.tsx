"use client";

import { utils } from "animejs";
import { inView, scroll } from "motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { ProductFrame } from "./product-frame";

const VIDEO_SRC = "/landing/prismpm-scroll.mp4";
const POSTER_SRC = "/landing/prismpm-scroll-poster.jpg";
const PRISM_SRC = "/landing/prismpm-prism.mp4";
const PRISM_POSTER_SRC = "/landing/prismpm-prism-poster.jpg";

/** How hard the playhead chases the scroll position, in anime.js `damp` terms: 1 snaps, 0 never moves. */
const SCRUB_FACTOR = 0.14;

/** Screens of scroll the prism prologue takes before the descent begins. */
const PRISM_SCREENS = 3;
/** Where the camera starts pushing into the prism, in seconds of the prologue clip. */
const PRISM_ZOOM_START = 7;
/** Where the prism sits in the 16:9 frame, as a fraction of its width and height. */
const PRISM_FOCUS = { x: 0.5375, y: 0.303 };
/** How far the push goes: far enough that the prism fills the screen before it dissolves. */
const PRISM_ZOOM = 9;
/** The share of the prologue, at its end, over which the prism dissolves into the plan view. */
const PRISM_HANDOFF = 0.18;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const easeInQuad = (n: number) => n * n;
const smoothstep = (n: number) => n * n * (3 - 2 * n);

/** Sizes a 16:9 box to cover the stage, so a point in the frame is a fixed percentage of the box. */
const coverStyle = {
  width: "max(100%, calc(100vh * 16 / 9))",
  aspectRatio: "16 / 9",
  transformOrigin: `${PRISM_FOCUS.x * 100}% ${PRISM_FOCUS.y * 100}%`,
} as const;

/**
 * One beat of the descent, from the plan view above the tower down into a single room.
 * Each pairs the shot it sits over with the part of PrismPM that shot stands for.
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
    body: "Decisions cite the Passages they came from. The Assistant reads and writes through the same services you do, so nothing moves without leaving a record.",
  },
];

type VideoState = "pending" | "ready" | "missing";

export function ScrollVideo() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const prismRef = useRef<HTMLVideoElement>(null);
  const prismLayerRef = useRef<HTMLDivElement>(null);
  const flareRef = useRef<HTMLDivElement>(null);
  const planLayerRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLSpanElement>(null);
  /** Written every scroll frame, read by the scrub loop - deliberately not state. */
  const progress = useRef(0);
  const [active, setActive] = useState(0);
  const [video, setVideo] = useState<VideoState>("pending");
  const [prism, setPrism] = useState<VideoState>("pending");
  const [loadVideo, setLoadVideo] = useState(false);
  // Keep every chapter readable without JavaScript; enhance after the media-query check.
  const [narrow, setNarrow] = useState(true);

  const markReady = useCallback(() => {
    setVideo("ready");
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    // Loading finishes long before hydration attaches the handlers below, so settle
    // whatever already happened to the element before trusting its events.
    if (el.error || el.networkState === el.NETWORK_NO_SOURCE) setVideo("missing");
    else if (el.readyState >= el.HAVE_METADATA) markReady();
  }, [markReady]);

  useEffect(() => {
    const el = prismRef.current;
    if (!el) return;
    if (el.error) setPrism("missing");
    else if (el.readyState >= el.HAVE_METADATA) setPrism("ready");
  }, [loadVideo]);

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
  /** Without its clip the prologue would be screens of a still frame, so it steps aside. */
  const prologue = prism === "missing" ? 0 : PRISM_SCREENS;
  /** The part of the stage's scroll the prologue owns; the descent gets the rest. */
  const prologueShare = prologue / (prologue + chapters.length);

  useEffect(() => {
    const el = videoRef.current;
    if (!cinema || !el) return;
    return inView(el, () => setLoadVideo(true));
  }, [cinema]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!cinema || !section) return;
    let shown = -1;
    return scroll(
      (p: number) => {
        progress.current = p;
        const descent = prologueShare < 1 ? clamp01((p - prologueShare) / (1 - prologueShare)) : 0;
        const rail = railRef.current;
        if (rail) rail.style.transform = `scaleX(${Math.max(descent, 0.004)})`;
        const next = Math.min(chapters.length - 1, Math.floor(descent * chapters.length));
        if (next !== shown) {
          shown = next;
          setActive(next);
        }
      },
      { target: section, offset: ["start start", "end end"] },
    );
  }, [cinema, prologueShare]);

  useEffect(() => {
    const section = sectionRef.current;
    const el = videoRef.current;
    const prismEl = prismRef.current;
    if (!cinema || video !== "ready" || !section || !el || !prismEl) return;

    let frame = 0;
    let last = 0;
    /** The scroll position the picture is showing, easing after the real one. */
    let shown = progress.current;

    const seek = (target: HTMLVideoElement, time: number) => {
      if (target.readyState < target.HAVE_METADATA) return;
      if (Math.abs(target.currentTime - time) > 0.005) target.currentTime = time;
    };

    const tick = (now: number) => {
      const delta = last ? Math.min(now - last, 50) : 16;
      last = now;
      shown = utils.damp(shown, progress.current, delta, SCRUB_FACTOR);

      // The prologue plays through, then from PRISM_ZOOM_START the camera pushes into the
      // prism and, as the glass fills the screen, the plan view slides in over it.
      const intro = prologueShare > 0 ? clamp01(shown / prologueShare) : 1;
      const descent = prologueShare < 1 ? clamp01((shown - prologueShare) / (1 - prologueShare)) : 0;
      const length = prismEl.duration > 0 ? prismEl.duration : 10;
      const zoomFrom = Math.min(PRISM_ZOOM_START / length, 0.95);
      const push = easeInQuad(clamp01((intro - zoomFrom) / (1 - zoomFrom)));
      const handoff = smoothstep(clamp01((intro - (1 - PRISM_HANDOFF)) / PRISM_HANDOFF));

      if (prologueShare > 0) seek(prismEl, intro * length * 0.999);
      if (el.duration > 0) seek(el, descent * el.duration);

      const prismLayer = prismLayerRef.current;
      if (prismLayer) {
        const scale = 1 + (PRISM_ZOOM - 1) * push;
        // Scaling about the prism keeps it still; the translate walks it to the centre as it grows.
        const dx = (0.5 - PRISM_FOCUS.x) * 100 * push;
        const dy = (0.5 - PRISM_FOCUS.y) * 100 * push;
        prismLayer.style.transform = `translate(-50%, -50%) translate(${dx}%, ${dy}%) scale(${scale})`;
        prismLayer.style.opacity = String(1 - handoff);
        prismLayer.style.visibility = handoff >= 1 ? "hidden" : "visible";
      }
      const flare = flareRef.current;
      if (flare) flare.style.opacity = String(Math.sin(Math.PI * handoff) * 0.85);
      const planLayer = planLayerRef.current;
      if (planLayer) {
        planLayer.style.opacity = String(prologueShare > 0 ? handoff : 1);
        // The plan view slides in from the right, the side the spectrum leaves the prism on.
        planLayer.style.transform = `translateX(${(1 - (prologueShare > 0 ? handoff : 1)) * 100}%)`;
      }
      const copy = copyRef.current;
      if (copy) copy.style.opacity = String(prologueShare > 0 ? handoff : 1);

      frame = requestAnimationFrame(tick);
    };

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    };

    // Only scrub while the stage is on screen; decoding frames off-screen is pure cost.
    const unwatch = inView(section, () => {
      // Prime Safari only when the film is on screen, never during hero loading.
      for (const target of [prismEl, el]) {
        void target
          .play()
          .then(() => target.pause())
          .catch(() => {});
      }
      if (!frame) frame = requestAnimationFrame(tick);
      return stop;
    });

    return () => {
      unwatch();
      stop();
    };
  }, [cinema, video, prologueShare]);

  const film = (
    <video
      ref={videoRef}
      src={loadVideo ? VIDEO_SRC : undefined}
      poster={POSTER_SRC}
      muted
      playsInline
      disablePictureInPicture
      preload={loadVideo ? "auto" : "none"}
      aria-hidden
      className={cn("h-full w-full object-cover", cinema ? "absolute inset-0" : "block aspect-video")}
      onLoadedMetadata={markReady}
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
      {/* One screen of scroll per beat, after the prologue. The shots inside stay pinned for all of them. */}
      <div ref={sectionRef} className="relative" style={{ height: `${(prologue + chapters.length) * 100}vh` }}>
        <div className="sticky top-0 h-screen w-full overflow-hidden bg-canvas">
          {prologue > 0 && (
            <div
              ref={prismLayerRef}
              aria-hidden
              className="absolute top-1/2 left-1/2 will-change-[opacity,transform]"
              style={{ ...coverStyle, transform: "translate(-50%, -50%)" }}
            >
              <video
                ref={prismRef}
                src={loadVideo ? PRISM_SRC : undefined}
                poster={PRISM_POSTER_SRC}
                muted
                playsInline
                disablePictureInPicture
                preload={loadVideo ? "auto" : "none"}
                className="block h-full w-full"
                onLoadedMetadata={() => setPrism("ready")}
                onError={() => setPrism("missing")}
              />
            </div>
          )}

          {/* Above the prism, so it slides in over the glass rather than being uncovered. */}
          <div
            ref={planLayerRef}
            className="absolute inset-0 will-change-[opacity,transform]"
            style={{ opacity: prologue > 0 ? 0 : 1 }}
          >
            {film}
          </div>

          {/* Light through the glass: blooms as the camera enters the prism and hides the seam. */}
          <div
            ref={flareRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0 mix-blend-screen"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.9) 0%, rgba(190,215,255,0.45) 18%, rgba(140,120,255,0.18) 38%, transparent 62%)",
            }}
          />

          {/* Legibility, and edges that dissolve into the canvas rather than stopping at a line. */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, var(--color-canvas) 0%, color-mix(in srgb, var(--color-canvas) 70%, transparent) 20%, color-mix(in srgb, var(--color-canvas) 28%, transparent) 42%, transparent 62%), linear-gradient(to bottom, var(--color-canvas) 0%, transparent 16%)",
            }}
          />

          <div
            ref={copyRef}
            className="relative flex h-full flex-col justify-end"
            style={{ opacity: prologue > 0 ? 0 : 1 }}
          >
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

            <div className="mx-auto w-full max-w-[1280px] px-6 pb-10">
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

            <div className="mx-auto w-full max-w-[1280px] px-6 pb-10">
              <div className="relative h-px w-full bg-hairline-tertiary">
                <span
                  ref={railRef}
                  className="absolute inset-0 origin-left bg-primary"
                  style={{ transform: "scaleX(0.004)" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
