"use client";

import { Plus } from "lucide-react";
import * as React from "react";
import type { ActionResult } from "@/server/core/action";
import { linkEvidenceAction, unlinkEvidenceAction } from "@/server/modules/evidence/actions";
import type { LinkTarget } from "@/server/modules/evidence/repository";
import type { ProjectRefs } from "@/server/modules/projects/refs";
import { labelFor, type LinkableEntityType } from "@/shared/domain";
import { Button, CommandPicker } from "@/shared/ui";
import { LINKED_ITEM_ICON, LinkedItemChip, itemHref, keyTextFor } from "@/entities/evidence/linked-item-chip";

type LinkAction = (input: Parameters<typeof linkEvidenceAction>[0]) => Promise<ActionResult<unknown>>;

/**
 * "Linked to" section of the Evidence page: chips for every Task/Risk/Milestone this record is
 * linked to (click opens the item's dialog), plus a "Link item" picker searching by key or name.
 * Not a `<form>`; writes call the JSON actions directly.
 */
export function LinkedItems({
  refs,
  evidenceId,
  targets,
}: {
  refs: ProjectRefs;
  evidenceId: string;
  targets: LinkTarget[];
}) {
  const links = refs.evidenceLinks.filter((l) => l.evidenceId === evidenceId);
  const linked = new Set(links.map((l) => `${l.entityType}:${l.entityId}`));
  const options = targets.filter((t) => !linked.has(`${t.entityType}:${t.entityId}`));
  const [adding, setAdding] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function call(action: LinkAction, entityType: LinkableEntityType, entityId: string) {
    setPending(true);
    setError(null);
    const res = await action({ projectId: refs.project.id, evidenceId, entityType, entityId });
    setPending(false);
    if (!res.ok) setError(res.error);
    else setAdding(false);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-caption font-medium text-ink-subtle">Linked to</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setAdding(true)}
          disabled={pending || adding || !options.length}
          title={options.length ? undefined : "Every item in this project is already linked"}
        >
          <Plus className="size-3.5" /> Link item
        </Button>
      </div>
      {links.length === 0 && !adding && <p className="text-caption text-ink-tertiary">Not linked to any item</p>}
      {links.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {links.map((l) => (
            <LinkedItemChip
              key={`${l.entityType}:${l.entityId}`}
              entityType={l.entityType}
              label={l.entityLabel || labelFor(l.entityType)}
              keyText={keyTextFor(refs.project.key, l.entityType, l.entityNumber)}
              href={itemHref(refs.project.id, l.entityType, l.entityId)}
              disabled={pending}
              onRemove={() => call(unlinkEvidenceAction, l.entityType, l.entityId)}
            />
          ))}
        </div>
      )}
      {adding && (
        <div className="max-w-md">
          <CommandPicker
            placeholder="Search tasks, risks, milestones…"
            emptyText="No item matches."
            items={options.map((t) => {
              const keyText = keyTextFor(refs.project.key, t.entityType, t.number);
              const Icon = LINKED_ITEM_ICON[t.entityType];
              return {
                id: `${t.entityType}:${t.entityId}`,
                label: t.label,
                hint: keyText || labelFor(t.entityType),
                keywords: [keyText, t.entityType].filter(Boolean),
                icon: <Icon className="size-3.5 shrink-0 text-ink-subtle" />,
              };
            })}
            onPick={(id) => {
              const [entityType, entityId] = id.split(":") as [LinkableEntityType, string];
              void call(linkEvidenceAction, entityType, entityId);
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}
      {error && <p className="text-caption text-tag-red">{error}</p>}
    </div>
  );
}
