"use client";

import * as React from "react";
import type { ProjectRow } from "@/server/modules/projects/schema";
import { ShellContext, type ShellCtx } from "@/shared/lib/shell-context";
import { CreateProjectDialog } from "@/features/project/create-project-dialog";
import { CommandPalette } from "@/widgets/command-palette/command-palette";
import { Sidebar } from "./sidebar";

export { useShell } from "@/shared/lib/shell-context";

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
    () => ({ openPalette: () => setPalette(true), openNewProject: () => setNewProject(true) }),
    [],
  );

  return (
    <ShellContext.Provider value={ctx}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar projects={projects} user={user} onOpenPalette={ctx.openPalette} onNewProject={ctx.openNewProject} />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        projects={projects}
        onNewProject={ctx.openNewProject}
      />
      <CreateProjectDialog open={newProject} onClose={() => setNewProject(false)} />
    </ShellContext.Provider>
  );
}
