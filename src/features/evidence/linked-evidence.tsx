"use client";

import { Plus } from "lucide-react";
import * as React from "react";
import type { ActionResult } from "@/server/core/action";
import { linkEvidenceAction, unlinkEvidenceAction } from "@/server/modules/evidence/actions";
import type { ProjectRefs } from "@/server/modules/projects/refs";
import { labelFor, type LinkableEntityType } from "@/shared/domain";
import { Button, CommandPicker } from "@/shared/ui";
import { EvidenceChip, evidenceHref } from "@/entities/evidence/evidence-chip";

type LinkAction = (input: Parameters<typeof linkEvidenceAction>[0]) => Promise<ActionResult<unknown>>;

/**
 * "Linked evidence" section of an item dialog: chips with an unlink control plus an inline
 * "Add evidence" picker over the project's Evidence (already-linked records hidden).
 * Not a `<form>`: rendered inside the item ActionForm (see dependency-editor.tsx), so writes
 * call the JSON actions directly and every control is `type="button"`.
 */
export function LinkedEvidence({ refs, item }: { refs: ProjectRefs; item: { type: LinkableEntityType; id: string } }) {
  const links = refs.evidenceLinks.filter((l) => l.entityType === item.type && l.entityId === item.id);
  const linkedIds = new Set(links.map((l) => l.evidenceId));
  const options = refs.evidence.filter((e) => !linkedIds.has(e.id));
  const [adding, setAdding] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function call(action: LinkAction, evidenceId: string) {
    setPending(true);
    setError(null);
    const res = await action({ projectId: refs.project.id, evidenceId, entityType: item.type, entityId: item.id });
    setPending(false);
    if (!res.ok) setError(res.error);
    else setAdding(false);
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-hairline bg-surface-1 p-3">
      <div className="flex items-center justify-between">
        <span className="text-caption font-medium text-ink-subtle">Linked evidence</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setAdding(true)}
          disabled={pending || adding || !options.length}
          title={options.length ? undefined : "Every Evidence record in this project is already linked"}
        >
          <Plus className="size-3.5" /> Add evidence
        </Button>
      </div>
      {links.length === 0 && !adding && <p className="px-1 text-caption text-ink-tertiary">No linked evidence</p>}
      {links.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {links.map((l) => (
            <EvidenceChip
              key={l.evidenceId}
              title={l.evidenceTitle}
              kind={l.evidenceKind}
              href={evidenceHref(refs.project.id, l.evidenceId)}
              disabled={pending}
              onRemove={() => call(unlinkEvidenceAction, l.evidenceId)}
            />
          ))}
        </div>
      )}
      {adding && (
        <CommandPicker
          placeholder="Search evidence…"
          emptyText="No evidence matches."
          items={options.map((e) => ({ id: e.id, label: e.title, hint: labelFor(e.kind), keywords: [e.kind] }))}
          onPick={(id) => call(linkEvidenceAction, id)}
          onCancel={() => setAdding(false)}
        />
      )}
      {error && <p className="text-caption text-tag-red">{error}</p>}
    </div>
  );
}
