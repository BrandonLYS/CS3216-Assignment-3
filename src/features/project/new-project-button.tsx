"use client";

import { Plus } from "lucide-react";
import { Button } from "@/shared/ui";
import { useShell } from "@/shared/lib/shell-context";

export function NewProjectButton() {
  const { openNewProject } = useShell();
  return (
    <Button variant="primary" onClick={openNewProject}>
      <Plus className="size-3.5" /> New project
    </Button>
  );
}
