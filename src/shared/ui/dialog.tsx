"use client";

import { X } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/shared/lib/cn";
import { Button } from "./button";

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  // Portals can't render on the server; false during SSR/hydration, true afterwards.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const panel = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    // Only the topmost open dialog answers Escape, so a nested dialog does not close its parent.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const all = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (all[all.length - 1] === panel.current) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  // Portals still bubble React events through the component tree, so a form inside a nested
  // Dialog would submit the ActionForm that rendered it; stop submit at the overlay.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay/70 p-4 pt-[8vh] duration-150 animate-in fade-in-0"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onSubmit={(e) => e.stopPropagation()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "flex max-h-[84vh] w-full max-w-lg flex-col panel border-hairline-strong bg-surface-2 shadow-2xl duration-150 animate-in fade-in-0 zoom-in-95",
          className,
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-4 pb-3">
          <div>
            <h2 className="text-body font-medium text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-caption text-ink-subtle">{description}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 pb-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
