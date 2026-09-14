"use client";

import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Diamond } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";

export interface CalendarEvent {
  id: string;
  title: string;
  /** ISO date the event is shown on (due date). */
  date: string;
  color: string;
  href: string;
  kind: "task" | "milestone";
  /** Secondary text, e.g. project key or assignee. */
  meta?: string;
  done?: boolean;
}

export function Calendar({ events, initialDate }: { events: CalendarEvent[]; initialDate?: string }) {
  const [cursor, setCursor] = React.useState(() => (initialDate ? parseISO(initialDate) : new Date()));
  const [view, setView] = React.useState<"month" | "week">("month");

  const range =
    view === "month"
      ? {
          start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
          end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
        }
      : { start: startOfWeek(cursor, { weekStartsOn: 1 }), end: endOfWeek(cursor, { weekStartsOn: 1 }) };
  const days = eachDayOfInterval(range);

  const byDay = React.useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    for (const list of m.values()) list.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "milestone" ? -1 : 1));
    return m;
  }, [events]);

  const step = (n: number) => setCursor((c) => (view === "month" ? addMonths(c, n) : addWeeks(c, n)));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={() => step(-1)} aria-label="Previous">
            <ChevronLeft className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => step(1)} aria-label="Next">
            <ChevronRight className="size-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCursor(new Date())}>
            Today
          </Button>
          <h2 className="ml-2 text-body font-medium">
            {view === "month"
              ? format(cursor, "MMMM yyyy")
              : `${format(range.start, "d MMM")} – ${format(range.end, "d MMM yyyy")}`}
          </h2>
        </div>
        <div className="flex rounded-md border border-hairline bg-surface-1 p-0.5">
          {(["month", "week"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-sm px-2.5 py-1 text-caption capitalize transition-colors",
                view === v ? "bg-surface-3 text-ink" : "text-ink-subtle hover:text-ink",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-7 border-y border-hairline">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-2 py-1.5 text-caption font-medium text-ink-tertiary">
            {d}
          </div>
        ))}
      </div>

      <div className={cn("grid flex-1 grid-cols-7 overflow-y-auto", view === "month" ? "auto-rows-fr" : "")}>
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const list = byDay.get(key) ?? [];
          const muted = view === "month" && !isSameMonth(day, cursor);
          const visible = view === "month" ? list.slice(0, 3) : list;
          return (
            <div
              key={key}
              className={cn(
                "flex min-h-24 flex-col gap-0.5 border-r border-b border-hairline p-1.5 [&:nth-child(7n)]:border-r-0",
                muted && "bg-surface-1/40",
              )}
            >
              <div className="mb-0.5 flex items-center justify-between">
                <span
                  className={cn(
                    "inline-flex size-5 items-center justify-center rounded-full text-caption",
                    isToday(day)
                      ? "bg-primary font-medium text-on-primary"
                      : muted
                        ? "text-ink-tertiary"
                        : "text-ink-subtle",
                  )}
                >
                  {format(day, "d")}
                </span>
                {isSameDay(day, addDays(day, 0)) && list.length > 3 && view === "month" && (
                  <span className="text-[10px] text-ink-tertiary">+{list.length - 3}</span>
                )}
              </div>
              {visible.map((e) => (
                <Link
                  key={e.id}
                  href={e.href}
                  title={e.title}
                  className={cn(
                    "flex items-center gap-1.5 truncate rounded-xs px-1.5 py-0.5 text-[11px] leading-4 transition-colors hover:bg-surface-3",
                    e.done ? "text-ink-tertiary line-through" : "text-ink-muted",
                  )}
                  style={{ borderLeft: `2px solid ${e.color}` }}
                >
                  {e.kind === "milestone" && (
                    <Diamond className="size-2.5 shrink-0" style={{ color: e.color }} fill={e.color} />
                  )}
                  <span className="truncate">{e.title}</span>
                  {e.meta && <span className="ml-auto shrink-0 font-mono text-[9px] text-ink-tertiary">{e.meta}</span>}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
