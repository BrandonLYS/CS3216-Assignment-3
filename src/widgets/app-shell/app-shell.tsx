"use client";

import * as React from "react";
import { Menu } from "lucide-react";
import type { ProjectRow } from "@/server/modules/projects/schema";
import { ShellContext, type ShellCtx } from "@/shared/lib/shell-context";
import { Button, Dialog, Logo } from "@/shared/ui";
import { CreateProjectDialog } from "@/features/project/create-project-dialog";
import { CommandPalette } from "@/widgets/command-palette/command-palette";
import { Sidebar } from "./sidebar";

export { useShell } from "@/shared/lib/shell-context";

/** Dock open state lives in localStorage so a refresh mid-Conversation keeps the dock open. */
const ASSISTANT_OPEN_KEY = "vantage.assistant-open";
const listeners = new Set<() => void>();
const assistantOpenStore = {
  get: () => localStorage.getItem(ASSISTANT_OPEN_KEY) === "1",
  set: (open: boolean) => {
    localStorage.setItem(ASSISTANT_OPEN_KEY, open ? "1" : "0");
    listeners.forEach((l) => l());
  },
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function AppShell({
  projects,
  user,
  children,
}: {
  projects: ProjectRow[];
  user: { name: string; email: string };
  children: React.ReactNode;
}) {
  const [palette, setPalette] = React.useState(false);
  const [newProject, setNewProject] = React.useState(false);
  const [navigationOpen, setNavigationOpen] = React.useState(false);
  const assistantOpen = React.useSyncExternalStore(assistantOpenStore.subscribe, assistantOpenStore.get, () => false);
  const toggleAssistant = React.useCallback(() => assistantOpenStore.set(!assistantOpenStore.get()), []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const ctx = React.useMemo<ShellCtx>(
    () => ({
      openPalette: () => setPalette(true),
      openNewProject: () => setNewProject(true),
      assistantOpen,
      toggleAssistant,
    }),
    [assistantOpen, toggleAssistant],
  );

  return (
    <ShellContext.Provider value={ctx}>
      <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline px-4 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open navigation"
            aria-haspopup="dialog"
            aria-expanded={navigationOpen}
            onClick={() => setNavigationOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
          <Logo className="size-5" />
          <span className="text-body-sm font-medium">Vantage</span>
        </div>
        <Sidebar
          projects={projects}
          user={user}
          onOpenPalette={ctx.openPalette}
          onNewProject={ctx.openNewProject}
          className="hidden md:flex"
        />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
      <Dialog open={navigationOpen} onClose={() => setNavigationOpen(false)} title="Navigation">
        <Sidebar
          projects={projects}
          user={user}
          onNavigate={() => setNavigationOpen(false)}
          onOpenPalette={() => {
            setNavigationOpen(false);
            ctx.openPalette();
          }}
          onNewProject={() => {
            setNavigationOpen(false);
            ctx.openNewProject();
          }}
          className="h-[60dvh] w-full border-0 bg-transparent"
        />
      </Dialog>
      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        projects={projects}
        onNewProject={ctx.openNewProject}
        onToggleAssistant={ctx.toggleAssistant}
      />
      <CreateProjectDialog open={newProject} onClose={() => setNewProject(false)} />
    </ShellContext.Provider>
  );
}
