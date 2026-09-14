"use client";

import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/shared/lib/cn";

/**
 * Click-to-edit select rendered as the current value's trigger. Calls onChange and
 * shows a pending state; the parent (a server component) re-renders after revalidation.
 */
export function InlineSelect<T extends string>({
  value,
  options,
  onChange,
  render,
  className,
  align = "left",
  disabled,
}: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (value: T) => Promise<unknown>;
  render: (value: T) => React.ReactNode;
  className?: string;
  align?: "left" | "right";
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function pick(v: T) {
    setOpen(false);
    if (v === value) return;
    setPending(true);
    try {
      await onChange(v);
    } finally {
      setPending(false);
    }
  }

  return (
    <div ref={ref} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={cn(
          "group -mx-1 inline-flex items-center gap-1 rounded-sm px-1 transition-colors hover:bg-surface-3 disabled:pointer-events-none",
          pending && "opacity-50",
        )}
      >
        {render(value)}
        <ChevronDown className="size-3 text-ink-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
      {open && (
        <div
          role="listbox"
          className={cn(
            "absolute top-full z-30 mt-1 min-w-40 panel border-hairline-strong bg-surface-3 p-1 shadow-xl duration-100 animate-in fade-in-0 zoom-in-95",
            align === "right" ? "right-0" : "left-0",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => pick(o.value)}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-caption text-ink-muted hover:bg-surface-4 hover:text-ink",
                o.value === value && "bg-surface-4 text-ink",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
