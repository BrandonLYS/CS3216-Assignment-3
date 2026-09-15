import { differenceInCalendarDays, format, formatDistanceToNowStrict, isToday, parseISO } from "date-fns";

export const today = () => format(new Date(), "yyyy-MM-dd");

export const fmtDate = (iso: string | null | undefined, pattern = "d MMM") =>
  iso ? format(parseISO(iso), pattern) : "—";

export const fmtDateTime = (d: Date | string) => format(typeof d === "string" ? parseISO(d) : d, "d MMM, HH:mm");

export const relative = (d: Date | string) =>
  formatDistanceToNowStrict(typeof d === "string" ? parseISO(d) : d, { addSuffix: true });

/** Negative = overdue by N days, 0 = today, positive = due in N days. */
export const daysUntil = (iso: string) => differenceInCalendarDays(parseISO(iso), new Date());

export function dueLabel(
  iso: string | null | undefined,
  done = false,
): { text: string; tone: "muted" | "warn" | "danger" } {
  if (!iso) return { text: "No date", tone: "muted" };
  if (done) return { text: fmtDate(iso), tone: "muted" };
  const d = parseISO(iso);
  const n = daysUntil(iso);
  if (isToday(d)) return { text: "Today", tone: "warn" };
  if (n < 0) return { text: `${-n}d overdue`, tone: "danger" };
  if (n <= 3) return { text: `${n}d left`, tone: "warn" };
  return { text: fmtDate(iso), tone: "muted" };
}
