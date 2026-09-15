"use client";

import { ChevronDown, ChevronUp, Pencil, Plus, Star, Trash2 } from "lucide-react";
import * as React from "react";
import {
  createStatusAction,
  deleteStatusAction,
  reorderStatusesAction,
  updateStatusAction,
} from "@/server/modules/statuses/actions";
import type { StatusRow } from "@/server/modules/statuses/schema";
import { CATEGORIES_BY_SCOPE, STATUS_SCOPES, labelFor, type StatusScope } from "@/shared/domain";
import { ActionForm, Button, Dialog, Field, Input, Panel, SectionTitle, SelectField, TextField } from "@/shared/ui";
import { useFieldError } from "@/shared/ui/action-form";
import { StatusGlyph } from "@/entities/status/status-badge";

const SCOPE_BLURB: Record<StatusScope, string> = {
  task: "Columns on the board and groups in the list.",
  milestone: "How a checkpoint is tracking.",
  risk: "Lifecycle of a risk in the register.",
};

type Modal =
  | { kind: "create"; scope: StatusScope }
  | { kind: "edit"; status: StatusRow }
  | { kind: "delete"; status: StatusRow }
  | null;

export function StatusManager({ projectId, statuses }: { projectId: string; statuses: StatusRow[] }) {
  const [modal, setModal] = React.useState<Modal>(null);
  const [error, setError] = React.useState<string | null>(null);
  const close = () => setModal(null);

  async function move(scope: StatusScope, index: number, dir: -1 | 1) {
    const list = statuses.filter((s) => s.scope === scope);
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    const ids = list.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    const res = await reorderStatusesAction({ projectId, ids });
    if (!res.ok) setError(res.error);
  }

  async function makeDefault(status: StatusRow) {
    const fd = new FormData();
    fd.set("id", status.id);
    fd.set("isDefault", "true");
    const res = await updateStatusAction(fd);
    if (!res.ok) setError(res.error);
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <SectionTitle>Statuses</SectionTitle>
        <p className="mt-1 text-caption text-ink-subtle">
          Rename, recolour and add statuses per project. Every status maps to a fixed{" "}
          <span className="text-ink-muted">category</span> so views and the future AI layer keep their meaning.
        </p>
      </div>
      {error && <p className="text-caption text-tag-red">{error}</p>}
      {STATUS_SCOPES.map((scope) => {
        const list = statuses.filter((s) => s.scope === scope);
        return (
          <Panel key={scope} className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
              <div>
                <p className="text-body-sm font-medium text-ink">{labelFor(scope)} statuses</p>
                <p className="text-caption text-ink-tertiary">{SCOPE_BLURB[scope]}</p>
              </div>
              <Button size="sm" onClick={() => setModal({ kind: "create", scope })}>
                <Plus className="size-3.5" /> Add
              </Button>
            </div>
            <ul className="divide-y divide-hairline/60">
              {list.map((s, i) => (
                <li key={s.id} className="group flex items-center gap-3 px-4 py-2">
                  <div className="flex flex-col">
                    <button
                      onClick={() => move(scope, i, -1)}
                      disabled={i === 0}
                      className="text-ink-tertiary hover:text-ink disabled:opacity-20"
                      aria-label="Move up"
                    >
                      <ChevronUp className="size-3" />
                    </button>
                    <button
                      onClick={() => move(scope, i, 1)}
                      disabled={i === list.length - 1}
                      className="text-ink-tertiary hover:text-ink disabled:opacity-20"
                      aria-label="Move down"
                    >
                      <ChevronDown className="size-3" />
                    </button>
                  </div>
                  <StatusGlyph status={s} />
                  <span className="w-40 truncate text-body-sm text-ink">{s.name}</span>
                  <span className="rounded-full bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-ink-subtle">
                    {s.category}
                  </span>
                  {s.isDefault ? (
                    <span className="flex items-center gap-1 text-caption text-ink-subtle">
                      <Star className="size-3 fill-current" /> Default
                    </span>
                  ) : (
                    <button
                      onClick={() => makeDefault(s)}
                      className="text-caption text-ink-tertiary opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink"
                    >
                      Make default
                    </button>
                  )}
                  <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setModal({ kind: "edit", status: s })}
                      aria-label="Edit"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setModal({ kind: "delete", status: s })}
                      aria-label="Delete"
                      disabled={s.isDefault}
                    >
                      <Trash2 className="size-3.5 text-tag-red" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}

      <Dialog
        open={modal?.kind === "create" || modal?.kind === "edit"}
        onClose={close}
        title={modal?.kind === "edit" ? "Edit status" : "New status"}
      >
        {(modal?.kind === "create" || modal?.kind === "edit") && (
          <StatusForm
            key={modal.kind === "edit" ? modal.status.id : `new-${modal.scope}`}
            projectId={projectId}
            scope={modal.kind === "edit" ? modal.status.scope : modal.scope}
            status={modal.kind === "edit" ? modal.status : undefined}
            onClose={close}
          />
        )}
      </Dialog>

      <Dialog open={modal?.kind === "delete"} onClose={close} title="Delete status">
        {modal?.kind === "delete" && (
          <ActionForm
            action={deleteStatusAction}
            hidden={{ id: modal.status.id, projectId }}
            submitLabel="Delete"
            danger
            cancel={close}
            onSuccess={close}
          >
            <p className="text-body-sm text-ink-muted">
              Delete <span className="font-medium text-ink">{modal.status.name}</span>? Items must be reassigned first
              if any still use it.
            </p>
          </ActionForm>
        )}
      </Dialog>
    </section>
  );
}

function StatusForm({
  projectId,
  scope,
  status,
  onClose,
}: {
  projectId: string;
  scope: StatusScope;
  status?: StatusRow;
  onClose: () => void;
}) {
  const categories = CATEGORIES_BY_SCOPE[scope];
  return (
    <ActionForm
      action={status ? updateStatusAction : createStatusAction}
      hidden={status ? { id: status.id } : { projectId, scope }}
      submitLabel={status ? "Save" : "Add status"}
      cancel={onClose}
      onSuccess={onClose}
    >
      <TextField name="name" label="Name" required autoFocus defaultValue={status?.name} placeholder="In QA" />
      <SelectField
        name="category"
        label="Category"
        hint="The system meaning behind this status"
        defaultValue={status?.category ?? categories[0]}
        options={categories.map((c) => ({ value: c, label: labelFor(c) }))}
      />
      <ColorField defaultValue={status?.color ?? "#4ea7fc"} />
    </ActionForm>
  );
}

function ColorField({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = React.useState(defaultValue);
  const error = useFieldError("color");
  const swatches = ["#8a8f98", "#4ea7fc", "#5e6ad2", "#a68af7", "#4cb782", "#f2c94c", "#f2994a", "#eb5757"];
  return (
    <Field label="Colour" error={error}>
      <div className="flex items-center gap-2">
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setValue(c)}
            className="size-5 rounded-full ring-offset-2 ring-offset-surface-2 transition-shadow"
            style={{
              background: c,
              boxShadow: value === c ? `0 0 0 2px var(--color-surface-2), 0 0 0 4px ${c}` : undefined,
            }}
            aria-label={c}
          />
        ))}
        <Input
          name="color"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="ml-auto w-24 font-mono text-caption"
        />
      </div>
    </Field>
  );
}
