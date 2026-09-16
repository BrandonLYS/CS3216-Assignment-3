"use client";

import * as React from "react";
import { cn } from "@/shared/lib/cn";

/**
 * Controlled WAI-ARIA tabs with automatic activation and a roving tabindex.
 * Tab buttons are `type="button"` so the primitive is safe next to forms.
 */

interface TabsContextValue {
  value: string;
  onChange: (value: string) => void;
  id: string;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabs(component: string): TabsContextValue {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error(`<${component}> must be rendered inside <Tabs>`);
  return ctx;
}

/**
 * The `useId` prefix the primitives use for `${id}-tab-${value}` / `${id}-panel-${value}`.
 * For hand-rolled panels that must stay mounted while hidden (a `<TabPanel>` unmounts).
 */
export function useTabsId(): string {
  return useTabs("useTabsId").id;
}

export function Tabs({
  value,
  onValueChange,
  children,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const id = React.useId();
  const ctx = React.useMemo(() => ({ value, onChange: onValueChange, id }), [value, onValueChange, id]);
  return (
    <TabsContext.Provider value={ctx}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabList({ children, "aria-label": ariaLabel }: { children: React.ReactNode; "aria-label": string }) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]:not([disabled])"));
    if (!tabs.length) return;
    const current = tabs.findIndex((t) => t === document.activeElement);
    let next: number;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else if (e.key === "ArrowRight") next = current < 0 ? 0 : (current + 1) % tabs.length;
    else next = current < 0 ? tabs.length - 1 : (current - 1 + tabs.length) % tabs.length;
    e.preventDefault();
    const target = tabs[next]!;
    target.focus();
    target.click();
  };
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 border-b border-hairline" onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}

export function Tab({ value, children }: { value: string; children: React.ReactNode }) {
  const { value: active, onChange, id } = useTabs("Tab");
  const selected = active === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${id}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${id}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      onClick={() => onChange(value)}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-body-sm transition-colors",
        selected ? "border-primary text-ink" : "border-transparent text-ink-subtle hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function TabPanel({ value, children }: { value: string; children: React.ReactNode }) {
  const { value: active, id } = useTabs("TabPanel");
  if (active !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`${id}-panel-${value}`}
      aria-labelledby={`${id}-tab-${value}`}
      tabIndex={0}
      className="pt-4"
    >
      {children}
    </div>
  );
}
