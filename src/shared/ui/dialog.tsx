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

  const modal = React.useRef<HTMLDialogElement>(null);

  React.useLayoutEffect(() => {
    if (!open || !mounted) return;
    const dialog = modal.current;
    if (!dialog) return;
    const trigger = document.activeElement;
    // Native modality contains focus and makes the background inert.
    dialog.showModal();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = prev;
      // React may already have removed the portal, so native focus restoration cannot run.
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open, mounted]);

  if (!mounted || !open) return null;

  // Portals still bubble React events through the component tree, so a form inside a nested
  // Dialog would submit the ActionForm that rendered it; stop submit at the overlay.
  return createPortal(
    <dialog
      ref={modal}
      aria-label={title}
      aria-modal="true"
      className="fixed inset-0 z-50 m-0 hidden h-dvh max-h-none w-screen max-w-none items-start justify-center border-0 bg-overlay/70 p-4 pt-[8vh] text-ink duration-150 animate-in fade-in-0 backdrop:bg-transparent open:flex"
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onSubmit={(e) => e.stopPropagation()}
    >
      <div
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
    </dialog>,
    document.body,
  );
}
