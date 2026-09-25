"use client";

import { ArrowLeftRight, ChevronRight, ExternalLink, FolderKanban, Globe, Loader2, Pin, Trash2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { cn } from "@/shared/lib/cn";
import { relative } from "@/shared/lib/dates";
import { Panel } from "@/shared/ui";
import type { ConversationSummary } from "./assistant-dock";

/** localStorage-backed set of ids, same subscribe pattern as the dock's open flag in app-shell. */
function makeSetStore(key: string) {
  const listeners = new Set<() => void>();
  return {
    get: () => localStorage.getItem(key) ?? "",
    set: (s: ReadonlySet<string>) => {
      localStorage.setItem(key, [...s].join(","));
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
const collapsedStore = makeSetStore("vantage.chat-groups-collapsed");
const pinnedProjectsStore = makeSetStore("vantage.pinned-chat-projects");

const toggleIn = (set: ReadonlySet<string>, id: string) => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

/**
 * The chat history, grouped ChatGPT-style: pinned Projects first, then the rest of the Projects
 * with chats, then "Overall" (dashboard scope), then a defensive "Other" bucket for scopes that
 * match no Project. Group headers are dropdown toggles and Project groups can be pinned; both
 * states persist in localStorage. Incoming order (pinned first, then newest) is preserved within
 * each group. Items render as buttons in the dock or Links on the full-page view; right-click
 * opens the shared menu.
 */
export function ConversationList({
  conversations,
  projects,
  activeId,
  busy,
  hrefFor,
  onOpen,
  onContextMenu,
}: {
  conversations: ConversationSummary[];
  /** Group order and labels for the project sections. */
  projects: { id: string; name: string; key: string }[];
  activeId?: string;
  /** Conversation ids with a turn in flight - they get a spinner. */
  busy?: ReadonlySet<string>;
  /** When given, items are Links (full page); otherwise buttons that call `onOpen`. */
  hrefFor?: (id: string) => string;
  onOpen?: (c: ConversationSummary) => void;
  onContextMenu: (e: React.MouseEvent, c: ConversationSummary) => void;
}) {
  // Server snapshot is "" so SSR always renders the all-expanded, unpinned order; the real
  // localStorage values arrive on hydration without a mismatch.
  const collapsedRaw = React.useSyncExternalStore(collapsedStore.subscribe, collapsedStore.get, () => "");
  const pinnedRaw = React.useSyncExternalStore(pinnedProjectsStore.subscribe, pinnedProjectsStore.get, () => "");
  const collapsed = React.useMemo(() => new Set(collapsedRaw.split(",").filter(Boolean)), [collapsedRaw]);
  const pinned = React.useMemo(() => new Set(pinnedRaw.split(",").filter(Boolean)), [pinnedRaw]);

  const groups = React.useMemo(() => {
    const byScope = new Map<string | null, ConversationSummary[]>();
    for (const c of conversations) {
      const list = byScope.get(c.projectId) ?? [];
      list.push(c);
      byScope.set(c.projectId, list);
    }
    const out: { key: string; label: string; projectId: string | null; items: ConversationSummary[] }[] = [];
    // Pinned Projects lead, then the rest in `projects` order; both keep their pinned flag for the header button.
    const sorted = [...projects.filter((p) => pinned.has(p.id)), ...projects.filter((p) => !pinned.has(p.id))];
    for (const p of sorted) {
      const items = byScope.get(p.id);
      if (items?.length) out.push({ key: p.id, label: `${p.key} · ${p.name}`, projectId: p.id, items });
    }
    const overall = byScope.get(null);
    if (overall?.length) out.push({ key: "overall", label: "Overall", projectId: null, items: overall });
    const known = new Set<string | null>([null, ...projects.map((p) => p.id)]);
    const other = conversations.filter((c) => !known.has(c.projectId));
    if (other.length) out.push({ key: "other", label: "Other", projectId: null, items: other });
    return out;
  }, [conversations, projects, pinned]);

  return (
    <div className="px-2 pb-2">
      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.key);
        const isPinned = g.projectId !== null && pinned.has(g.projectId);
        return (
          <section key={g.key}>
            <div className="group flex items-center gap-1 px-3 pt-3 pb-1">
              <button
                type="button"
                onClick={() => collapsedStore.set(toggleIn(collapsed, g.key))}
                aria-expanded={!isCollapsed}
                aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${g.label}`}
                className="flex min-w-0 flex-1 items-center gap-1 text-left text-caption text-ink-subtle hover:text-ink"
              >
                <ChevronRight className={cn("size-3 shrink-0 transition-transform", !isCollapsed && "rotate-90")} />
                <span className="truncate">{g.label}</span>
              </button>
              {g.projectId !== null && (
                <button
                  type="button"
                  onClick={() => pinnedProjectsStore.set(toggleIn(pinned, g.projectId!))}
                  aria-label={isPinned ? "Unpin project" : "Pin project"}
                  aria-pressed={isPinned}
                  className={cn(
                    "shrink-0 transition-opacity",
                    isPinned ? "text-primary" : "text-ink-faint opacity-0 group-hover:opacity-100",
                  )}
                >
                  <Pin className="size-3" />
                </button>
              )}
            </div>
            {!isCollapsed && (
              <ul className="flex flex-col gap-0.5">
                {g.items.map((c) => (
                  <li key={c.id}>
                    <ConversationItem
                      c={c}
                      active={c.id === activeId}
                      busy={busy?.has(c.id) ?? false}
                      href={hrefFor?.(c.id)}
                      onOpen={onOpen}
                      onContextMenu={onContextMenu}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ConversationItem({
  c,
  active,
  busy,
  href,
  onOpen,
  onContextMenu,
}: {
  c: ConversationSummary;
  active: boolean;
  busy: boolean;
  href?: string;
  onOpen?: (c: ConversationSummary) => void;
  onContextMenu: (e: React.MouseEvent, c: ConversationSummary) => void;
}) {
  const className = cn("block w-full rounded-md px-3 py-2 text-left hover:bg-surface-3", active && "bg-surface-3");
  const handleMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, c);
  };
  const body = (
    <>
      <span className="flex items-center gap-1.5 truncate text-body-sm text-ink">
        {c.pinned && <Pin className="size-3 shrink-0 text-primary" />}
        <span className="truncate">{c.title ?? "New chat"}</span>
        {busy && <Loader2 className="size-3 shrink-0 animate-spin text-ink-subtle" />}
      </span>
      <span className="text-ink-faint block text-caption">{relative(c.updatedAt)}</span>
    </>
  );
  return href ? (
    <Link href={href} className={className} onContextMenu={handleMenu}>
      {body}
    </Link>
  ) : (
    <button type="button" className={className} onClick={() => onOpen?.(c)} onContextMenu={handleMenu}>
      {body}
    </button>
  );
}

/**
 * The right-click menu for a Conversation, shared by the dock and the full-page list. The "Change
 * access" submenu lists every scope except the Conversation's current one (`menu.c.projectId`).
 * Escape or a click on the backdrop dismisses it.
 */
export function ConversationMenu({
  menu,
  projects,
  onClose,
  onPin,
  onDelete,
  onScope,
}: {
  menu: { x: number; y: number; c: ConversationSummary } | null;
  projects: { id: string; name: string; key: string }[];
  onClose: () => void;
  onPin: (c: ConversationSummary) => void;
  onDelete: (c: ConversationSummary) => void;
  onScope: (c: ConversationSummary, targetProjectId: string | null) => void;
}) {
  const [scopeOpen, setScopeOpen] = React.useState(false);
  // Each fresh right-click restarts on the main menu.
  const [prevMenu, setPrevMenu] = React.useState(menu);
  if (prevMenu !== menu) {
    setPrevMenu(menu);
    setScopeOpen(false);
  }
  React.useEffect(() => {
    if (!menu) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menu, onClose]);

  if (!menu) return null;

  const scope = (target: string | null) => {
    onScope(menu.c, target);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-20"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <Panel
        role="menu"
        className="fixed p-1"
        style={{
          top: Math.min(menu.y, window.innerHeight - 60),
          left: Math.min(menu.x, window.innerWidth - 230),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {scopeOpen ? (
          <>
            <p className="px-2 pt-1 pb-1.5 text-caption text-ink-subtle">Chat access</p>
            {menu.c.projectId !== null && (
              <button
                type="button"
                role="menuitem"
                className="flex w-52 items-center gap-2 rounded px-2 py-1.5 text-left text-body-sm text-ink hover:bg-surface-3"
                onClick={() => scope(null)}
              >
                <Globe className="text-ink-faint size-3.5 shrink-0" />
                Overall (all projects)
              </button>
            )}
            {projects
              .filter((p) => p.id !== menu.c.projectId)
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="menuitem"
                  className="flex w-52 items-center gap-2 rounded px-2 py-1.5 text-left text-body-sm text-ink hover:bg-surface-3"
                  onClick={() => scope(p.id)}
                >
                  <FolderKanban className="text-ink-faint size-3.5 shrink-0" />
                  <span className="truncate">
                    {p.key} · {p.name}
                  </span>
                </button>
              ))}
          </>
        ) : (
          <>
            <a
              href={`/assistant/${menu.c.id}`}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              className="flex w-40 items-center gap-2 rounded px-2 py-1.5 text-left text-body-sm text-ink hover:bg-surface-3"
              onClick={onClose}
            >
              <ExternalLink className="text-ink-faint size-3.5" />
              Open in new tab
            </a>
            <button
              type="button"
              role="menuitem"
              className="flex w-40 items-center gap-2 rounded px-2 py-1.5 text-left text-body-sm text-ink hover:bg-surface-3"
              onClick={() => {
                onPin(menu.c);
                onClose();
              }}
            >
              <Pin className="text-ink-faint size-3.5" />
              {menu.c.pinned ? "Unpin chat" : "Pin chat"}
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-40 items-center gap-2 rounded px-2 py-1.5 text-left text-body-sm text-ink hover:bg-surface-3"
              onClick={() => setScopeOpen(true)}
            >
              <ArrowLeftRight className="text-ink-faint size-3.5" />
              Change access…
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-40 items-center gap-2 rounded px-2 py-1.5 text-left text-body-sm text-tag-red hover:bg-surface-3"
              onClick={() => {
                onDelete(menu.c);
                onClose();
              }}
            >
              <Trash2 className="size-3.5" />
              Delete chat
            </button>
          </>
        )}
      </Panel>
    </div>
  );
}
