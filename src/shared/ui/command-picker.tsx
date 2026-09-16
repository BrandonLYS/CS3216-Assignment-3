"use client";

import { Command } from "cmdk";
import * as React from "react";

export interface CommandPickerItem {
  /** Opaque, stable id passed to `onPick`. Matching never looks at it. */
  id: string;
  label: string;
  /** Right-aligned mono hint (a key, a kind…). */
  hint?: string;
  /** Extra search terms besides `label` (a key such as "ACME-12"). */
  keywords?: string[];
  icon?: React.ReactNode;
}

/** Case-insensitive substring match on label + keywords only; the id is never matched. */
const substringFilter = (_value: string, search: string, keywords: string[] = []) => {
  const q = search.trim().toLowerCase();
  if (!q) return 1;
  return keywords.some((k) => k.toLowerCase().includes(q)) ? 1 : 0;
};

/**
 * Inline (not popover) searchable list built on cmdk. It is rendered inside item dialogs whose
 * body scrolls, so a popover would be clipped. Never a `<form>`: Enter is prevented at the
 * wrapper so an enclosing ActionForm cannot submit implicitly, and Escape is stopped so the
 * Dialog's own Escape handler does not close the whole dialog.
 */
export function CommandPicker({
  items,
  placeholder,
  emptyText = "No matches.",
  onPick,
  onCancel,
  autoFocus = true,
}: {
  items: CommandPickerItem[];
  placeholder: string;
  emptyText?: string;
  onPick: (id: string) => void;
  onCancel: () => void;
  autoFocus?: boolean;
}) {
  return (
    <div
      className="rounded-md border border-hairline bg-surface-1"
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <Command label={placeholder} filter={substringFilter}>
        <Command.Input
          autoFocus={autoFocus}
          placeholder={placeholder}
          className="h-8 w-full border-b border-hairline bg-transparent px-3 text-body-sm text-ink placeholder:text-ink-tertiary focus:outline-none"
        />
        <Command.List className="max-h-48 overflow-y-auto p-1">
          <Command.Empty className="px-2 py-4 text-center text-caption text-ink-subtle">{emptyText}</Command.Empty>
          {items.map((it) => (
            <Command.Item
              key={it.id}
              value={it.id}
              keywords={[it.label, ...(it.keywords ?? [])]}
              onSelect={() => onPick(it.id)}
              className="flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2 text-body-sm text-ink-muted data-[selected=true]:bg-surface-3 data-[selected=true]:text-ink"
            >
              {it.icon}
              <span className="truncate">{it.label}</span>
              {it.hint && <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-tertiary">{it.hint}</span>}
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}
