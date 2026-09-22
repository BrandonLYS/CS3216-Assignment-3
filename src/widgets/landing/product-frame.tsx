import { Diamond } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Logo } from "@/shared/ui";

const nav = ["Overview", "Tasks", "Timeline", "Decisions", "Evidence", "Risks"];

const rows = [
  {
    key: "PAY-14",
    title: "Cut over the v2 payment endpoints",
    status: "In Progress",
    tone: "text-tag-blue",
    due: "20 Sep",
  },
  { key: "PAY-21", title: "Vendor sandbox credentials", status: "Blocked", tone: "text-tag-red", due: "12 Sep" },
  { key: "PAY-08", title: "Reconcile the legacy ledger", status: "Done", tone: "text-tag-green", due: "04 Sep" },
  { key: "PAY-26", title: "Dual-run window sign-off", status: "Not Started", tone: "text-tag-gray", due: "02 Oct" },
];

/**
 * A still of the product, built from tokens rather than a screenshot so it stays
 * crisp at any size. Doubles as the scroll stage's first paint and as its fallback
 * when the video asset is absent.
 */
export function ProductFrame({ className }: { className?: string }) {
  return (
    <div
      className={cn("rounded-xl border border-hairline bg-surface-1 p-1.5", className)}
      style={{ boxShadow: "inset 0 1px 0 0 rgb(255 255 255 / 0.05)" }}
      aria-hidden
    >
      <div className="overflow-hidden rounded-lg border border-hairline bg-canvas">
        <div className="flex h-9 items-center gap-2 border-b border-hairline px-3">
          <Logo className="size-3.5" />
          <span className="text-caption text-ink-muted">Payments Migration</span>
          <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-ink-subtle">
            42 events
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[124px_1fr]">
          <aside className="hidden flex-col gap-0.5 border-r border-hairline p-2.5 sm:flex">
            {nav.map((label, i) => (
              <span
                key={label}
                className={cn(
                  "rounded-md px-2 py-1 text-caption",
                  i === 3 ? "bg-surface-2 text-ink" : "text-ink-tertiary",
                )}
              >
                {label}
              </span>
            ))}
          </aside>

          <div className="min-w-0 p-3 sm:p-4">
            <div className="rounded-lg border border-hairline bg-surface-1 p-3">
              <div className="flex items-center gap-2">
                <Diamond className="size-3 text-primary" />
                <span className="text-caption font-medium text-ink">Dual-run rather than a hard cutover</span>
                <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-ink-subtle">
                  active
                </span>
              </div>
              <p className="mt-2 text-caption leading-relaxed text-ink-subtle">
                Rests on 2 assumptions · cites 3 sources · supersedes one earlier decision.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <span className="rounded-sm border border-hairline px-1.5 py-0.5 text-[10px] text-ink-muted">
                  UAT begins holds
                </span>
                <span className="rounded-sm border border-hairline px-1.5 py-0.5 text-[10px] text-tag-orange">
                  Vendor contact broken
                </span>
              </div>
            </div>

            <div className="mt-3 divide-y divide-hairline">
              {rows.map((row) => (
                <div key={row.key} className="flex items-center gap-2.5 py-2">
                  <span className="font-mono text-[10px] text-ink-tertiary">{row.key}</span>
                  <span className="min-w-0 flex-1 truncate text-caption text-ink-muted">{row.title}</span>
                  <span className={cn("hidden text-[10px] sm:inline", row.tone)}>{row.status}</span>
                  <span className="font-mono text-[10px] text-ink-tertiary">{row.due}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
