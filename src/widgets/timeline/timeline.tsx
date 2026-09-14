"use client";

import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  isToday,
  isWeekend,
  max,
  min,
  parseISO,
  startOfWeek,
} from "date-fns";
import { Diamond, Link2, Minus, Plus } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";

export interface TimelineItem {
  id: string;
  type: "task" | "milestone";
  title: string;
  /** ISO dates. Milestones have start === end. */
  start: string | null;
  end: string | null;
  color: string;
  statusName: string;
  done: boolean;
  href: string;
  /** Milestone grouping for tasks. */
  groupId: string | null;
  meta?: string;
}

export interface TimelineEdge {
  id: string;
  predecessorId: string;
  successorId: string;
}

const ROW_H = 36;
const ZOOMS = [14, 24, 40] as const;

export function Timeline({
  items,
  edges,
  onAddDependency,
}: {
  items: TimelineItem[];
  edges: TimelineEdge[];
  onAddDependency?: () => void;
}) {
  const [zoom, setZoom] = React.useState<number>(1);
  const dayW = ZOOMS[zoom]!;

  const scheduled = items.filter((i) => i.start && i.end);
  const unscheduled = items.filter((i) => !(i.start && i.end));

  // Group tasks under their milestone (ordered by milestone date), milestones as their own rows.
  const rows = React.useMemo(() => {
    const milestones = scheduled.filter((i) => i.type === "milestone").sort((a, b) => a.end!.localeCompare(b.end!));
    const tasks = scheduled.filter((i) => i.type === "task").sort((a, b) => a.start!.localeCompare(b.start!));
    const out: (TimelineItem & { depth: number })[] = [];
    for (const m of milestones) {
      out.push({ ...m, depth: 0 });
      for (const t of tasks.filter((t) => t.groupId === m.id)) out.push({ ...t, depth: 1 });
    }
    const orphan = tasks.filter((t) => !t.groupId || !milestones.some((m) => m.id === t.groupId));
    for (const t of orphan) out.push({ ...t, depth: 0 });
    return out;
  }, [scheduled]);

  const dates = scheduled.flatMap((i) => [parseISO(i.start!), parseISO(i.end!)]);
  const rangeStart = startOfWeek(addDays(dates.length ? min([...dates, new Date()]) : new Date(), -7), {
    weekStartsOn: 1,
  });
  const rangeEnd = addDays(dates.length ? max([...dates, new Date()]) : new Date(), 21);
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  const totalW = days.length * dayW;
  const x = (iso: string) => differenceInCalendarDays(parseISO(iso), rangeStart) * dayW;

  const rowIndex = new Map(rows.map((r, i) => [r.id, i]));
  const geometry = (r: TimelineItem) => {
    if (r.type === "milestone") {
      const cx = x(r.end!) + dayW / 2;
      return { left: cx, right: cx };
    }
    return { left: x(r.start!), right: x(r.end!) + dayW };
  };

  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(0, differenceInCalendarDays(new Date(), rangeStart) * dayW - el.clientWidth / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayW]);

  // Month header segments
  const months: { label: string; span: number }[] = [];
  for (const d of days) {
    const label = format(d, "MMM yyyy");
    const last = months[months.length - 1];
    if (last && last.label === label) last.span++;
    else months.push({ label, span: 1 });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-6 py-2">
        <p className="text-caption text-ink-subtle">
          {scheduled.length} scheduled · {edges.length} dependencies
        </p>
        <div className="flex items-center gap-1">
          {onAddDependency && (
            <Button size="sm" variant="secondary" onClick={onAddDependency}>
              <Link2 className="size-3.5" /> Add dependency
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setZoom((z) => Math.max(0, z - 1))}
            disabled={zoom === 0}
            aria-label="Zoom out"
          >
            <Minus className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
            disabled={zoom === ZOOMS.length - 1}
            aria-label="Zoom in"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 border-t border-hairline">
        {/* Left: names */}
        <div className="w-72 shrink-0 border-r border-hairline">
          <div className="h-12 border-b border-hairline px-4 py-1.5 text-caption text-ink-tertiary">Item</div>
          {rows.map((r) => (
            <Link
              key={r.id}
              href={r.href}
              className="flex items-center gap-2 border-b border-hairline/60 px-4 text-body-sm text-ink-muted hover:bg-surface-1 hover:text-ink"
              style={{ height: ROW_H, paddingLeft: 16 + r.depth * 16 }}
            >
              {r.type === "milestone" ? (
                <Diamond className="size-3 shrink-0" style={{ color: r.color }} fill={r.color} />
              ) : (
                <span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} />
              )}
              <span
                className={cn(
                  "truncate",
                  r.type === "milestone" && "font-medium text-ink",
                  r.done && "text-ink-tertiary line-through",
                )}
              >
                {r.title}
              </span>
              {r.meta && <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-tertiary">{r.meta}</span>}
            </Link>
          ))}
        </div>

        {/* Right: bars */}
        <div ref={scrollRef} className="relative flex-1 overflow-auto">
          <div style={{ width: totalW }} className="relative">
            <div className="sticky top-0 z-10 bg-canvas">
              <div className="flex h-6 border-b border-hairline/60">
                {months.map((m, i) => (
                  <div
                    key={i}
                    className="flex border-r border-hairline/60 text-caption text-ink-subtle"
                    style={{ width: m.span * dayW }}
                  >
                    <span className="sticky left-0 truncate px-2">{m.label}</span>
                  </div>
                ))}
              </div>
              <div className="flex h-6 border-b border-hairline">
                {days.map((d) => (
                  <div
                    key={d.toISOString()}
                    className={cn(
                      "shrink-0 text-center text-[10px] leading-6",
                      isToday(d) ? "text-primary-hover" : isWeekend(d) ? "text-ink-tertiary/60" : "text-ink-tertiary",
                    )}
                    style={{ width: dayW }}
                  >
                    {dayW >= 24 ? format(d, "d") : d.getDay() === 1 ? format(d, "d") : ""}
                  </div>
                ))}
              </div>
            </div>

            {/* Grid background */}
            <div className="pointer-events-none absolute inset-x-0 top-12 bottom-0 flex">
              {days.map((d) => (
                <div
                  key={d.toISOString()}
                  className={cn("shrink-0 border-r border-hairline/30", isWeekend(d) && "bg-surface-1/50")}
                  style={{ width: dayW }}
                />
              ))}
            </div>
            {/* Today */}
            <div
              className="pointer-events-none absolute top-12 bottom-0 z-[5] w-px bg-primary/70"
              style={{ left: differenceInCalendarDays(new Date(), rangeStart) * dayW + dayW / 2 }}
            />

            {/* Rows */}
            <div className="relative" style={{ height: rows.length * ROW_H }}>
              {rows.map((r, i) => {
                const g = geometry(r);
                return (
                  <div
                    key={r.id}
                    className="absolute inset-x-0 border-b border-hairline/60"
                    style={{ top: i * ROW_H, height: ROW_H }}
                  >
                    {r.type === "milestone" ? (
                      <Link
                        href={r.href}
                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                        style={{ left: g.left }}
                        title={`${r.title} · ${format(parseISO(r.end!), "d MMM")}`}
                      >
                        <Diamond className="size-4" style={{ color: r.color }} fill={r.color} />
                      </Link>
                    ) : (
                      <Link
                        href={r.href}
                        className={cn(
                          "absolute top-2 flex h-5 items-center overflow-hidden rounded-xs px-1.5 text-[11px] text-white/90 transition-[filter] hover:brightness-125",
                          r.done && "opacity-50",
                        )}
                        style={{ left: g.left, width: Math.max(g.right - g.left, 6), background: r.color }}
                        title={`${r.title} · ${format(parseISO(r.start!), "d MMM")} – ${format(parseISO(r.end!), "d MMM")}`}
                      >
                        {g.right - g.left > 60 && <span className="truncate">{r.title}</span>}
                      </Link>
                    )}
                  </div>
                );
              })}

              {/* Dependency arrows */}
              <svg
                className="pointer-events-none absolute inset-0 z-[6] h-full w-full"
                width={totalW}
                height={rows.length * ROW_H}
              >
                <defs>
                  <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 z" fill="var(--color-ink-subtle)" />
                  </marker>
                </defs>
                {edges.map((e) => {
                  const a = rows[rowIndex.get(e.predecessorId) ?? -1];
                  const b = rows[rowIndex.get(e.successorId) ?? -1];
                  if (!a || !b) return null;
                  const ga = geometry(a);
                  const gb = geometry(b);
                  const y1 = rowIndex.get(a.id)! * ROW_H + ROW_H / 2;
                  const y2 = rowIndex.get(b.id)! * ROW_H + ROW_H / 2;
                  const x1 = a.type === "milestone" ? ga.right + 8 : ga.right;
                  const x2 = b.type === "milestone" ? gb.left - 8 : gb.left;
                  // A dependency is violated when the predecessor finishes after the successor starts.
                  const late = a.end! > b.start!;
                  // Route around when there is no horizontal room, taking the short vertical hop between rows.
                  const backRoute = x2 < x1 + 16;
                  const yMid = y2 > y1 ? y1 + ROW_H / 2 : y1 - ROW_H / 2;
                  const path = backRoute
                    ? `M${x1},${y1} H${x1 + 10} V${yMid} H${x2 - 10} V${y2} H${x2}`
                    : `M${x1},${y1} H${Math.max(x1 + 8, x2 - 8)} V${y2} H${x2}`;
                  return (
                    <path
                      key={e.id}
                      d={path}
                      fill="none"
                      stroke={late ? "var(--color-tag-red)" : "var(--color-ink-subtle)"}
                      strokeWidth={1.25}
                      markerEnd="url(#arrow)"
                      opacity={0.9}
                    />
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      </div>

      {unscheduled.length > 0 && (
        <div className="border-t border-hairline px-6 py-2 text-caption text-ink-subtle">
          {unscheduled.length} unscheduled item{unscheduled.length === 1 ? "" : "s"} hidden — add start and due dates to
          place them on the timeline.
        </div>
      )}
    </div>
  );
}
