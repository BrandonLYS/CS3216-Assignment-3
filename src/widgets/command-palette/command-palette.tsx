"use client";

import { Command } from "cmdk";
import {
  AlertTriangle,
  CalendarDays,
  CalendarRange,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import type { ProjectRow } from "@/server/modules/projects/schema";

export const PROJECT_SECTIONS = [
  { slug: "", label: "Overview", icon: LayoutDashboard },
  { slug: "tasks", label: "Tasks", icon: ListTodo },
  { slug: "timeline", label: "Timeline", icon: CalendarRange },
  { slug: "calendar", label: "Calendar", icon: CalendarDays },
  { slug: "risks", label: "Risks", icon: AlertTriangle },
  { slug: "evidence", label: "Evidence", icon: FileText },
  { slug: "people", label: "People", icon: Users },
  { slug: "settings", label: "Settings", icon: Settings },
] as const;

export function CommandPalette({
  open,
  onClose,
  projects,
  onNewProject,
}: {
  open: boolean;
  onClose: () => void;
  projects: ProjectRow[];
  onNewProject: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const currentProject = projects.find((p) => pathname.startsWith(`/projects/${p.id}`));

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay/70 pt-[15vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <Command
        label="Command palette"
        className="w-full max-w-lg overflow-hidden panel border-hairline-strong bg-surface-2 shadow-2xl duration-150 animate-in fade-in-0 zoom-in-95"
      >
        <Command.Input
          autoFocus
          placeholder="Type a command or search…"
          className="h-12 w-full border-b border-hairline bg-transparent px-4 text-body-sm text-ink placeholder:text-ink-tertiary focus:outline-none"
        />
        <Command.List className="max-h-80 overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-eyebrow [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-[0.4px] [&_[cmdk-group-heading]]:text-ink-tertiary [&_[cmdk-group-heading]]:uppercase">
          <Command.Empty className="px-2 py-6 text-center text-caption text-ink-subtle">No results.</Command.Empty>

          {currentProject && (
            <Command.Group heading={currentProject.name}>
              {PROJECT_SECTIONS.map((s) => (
                <Item
                  key={s.slug}
                  icon={s.icon}
                  onSelect={() => go(`/projects/${currentProject.id}${s.slug ? `/${s.slug}` : ""}`)}
                >
                  {s.label}
                </Item>
              ))}
            </Command.Group>
          )}

          <Command.Group heading="Go to">
            <Item icon={LayoutDashboard} onSelect={() => go("/")}>
              Dashboard
            </Item>
            <Item icon={FolderKanban} onSelect={() => go("/projects")}>
              Projects
            </Item>
            <Item icon={CalendarDays} onSelect={() => go("/calendar")}>
              Calendar
            </Item>
          </Command.Group>

          <Command.Group heading="Projects">
            {projects.map((p) => (
              <Item key={p.id} icon={FolderKanban} onSelect={() => go(`/projects/${p.id}`)}>
                {p.name}
                <span className="ml-auto font-mono text-[10px] text-ink-tertiary">{p.key}</span>
              </Item>
            ))}
          </Command.Group>

          <Command.Group heading="Actions">
            <Item
              icon={Plus}
              onSelect={() => {
                onClose();
                onNewProject();
              }}
            >
              New project
            </Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}

function Item({
  icon: Icon,
  children,
  onSelect,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 text-body-sm text-ink-muted data-[selected=true]:bg-surface-3 data-[selected=true]:text-ink"
    >
      <Icon className="size-4 text-ink-subtle" />
      {children}
    </Command.Item>
  );
}
