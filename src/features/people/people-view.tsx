"use client";

import { Pencil, Plus, Trash2, Users } from "lucide-react";
import * as React from "react";
import {
  createPersonAction,
  createTeamAction,
  deletePersonAction,
  deleteTeamAction,
  updatePersonAction,
  updateTeamAction,
} from "@/server/modules/people/actions";
import type { PersonRow, TeamRow } from "@/server/modules/people/schema";
import type { ProjectRefs } from "@/server/modules/projects/refs";
import type { TaskListItem } from "@/server/modules/tasks/repository";
import { TERMINAL_CATEGORIES } from "@/shared/domain";
import {
  ActionForm,
  Button,
  Dialog,
  EmptyState,
  Panel,
  SectionTitle,
  SelectField,
  TextField,
  TextareaField,
} from "@/shared/ui";
import { Avatar } from "@/entities/person/avatar";

type PersonModal =
  | { kind: "person"; person?: PersonRow }
  | { kind: "team"; team?: TeamRow }
  | { kind: "delete-person"; person: PersonRow }
  | { kind: "delete-team"; team: TeamRow }
  | null;

export function PeopleView({ refs, tasks }: { refs: ProjectRefs; tasks: TaskListItem[] }) {
  const [modal, setModal] = React.useState<PersonModal>(null);
  const close = () => setModal(null);
  const projectId = refs.project.id;
  const openCount = (personId: string) =>
    tasks.filter((t) => t.task.assigneeId === personId && !TERMINAL_CATEGORIES.has(t.status.category)).length;
  const teamName = (id: string | null) => refs.teams.find((t) => t.id === id)?.name;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-6xl grid-cols-3 gap-6 p-6">
        <section className="col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <SectionTitle>People</SectionTitle>
            <Button size="sm" variant="primary" onClick={() => setModal({ kind: "person" })}>
              <Plus className="size-3.5" /> Add person
            </Button>
          </div>
          <Panel className="divide-y divide-hairline">
            {refs.people.length === 0 && (
              <EmptyState
                icon={<Users />}
                title="No people yet"
                description="Add the team members, vendor contacts and stakeholders who own work here."
              />
            )}
            {refs.people.map((p) => (
              <div key={p.id} className="group flex items-center gap-3 px-4 py-2.5">
                <Avatar name={p.name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm text-ink">{p.name}</p>
                  <p className="truncate text-caption text-ink-subtle">
                    {[p.role, teamName(p.teamId), p.email].filter(Boolean).join(" · ") || "No details"}
                  </p>
                </div>
                <span className="text-caption text-ink-tertiary">{openCount(p.id)} open</span>
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setModal({ kind: "person", person: p })}
                    aria-label="Edit"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setModal({ kind: "delete-person", person: p })}
                    aria-label="Delete"
                  >
                    <Trash2 className="size-3.5 text-tag-red" />
                  </Button>
                </div>
              </div>
            ))}
          </Panel>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <SectionTitle>Teams</SectionTitle>
            <Button size="sm" onClick={() => setModal({ kind: "team" })}>
              <Plus className="size-3.5" /> Add team
            </Button>
          </div>
          <Panel className="divide-y divide-hairline">
            {refs.teams.length === 0 && (
              <p className="px-4 py-6 text-center text-caption text-ink-subtle">No teams yet.</p>
            )}
            {refs.teams.map((t) => (
              <div key={t.id} className="group flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm text-ink">{t.name}</p>
                  <p className="truncate text-caption text-ink-subtle">
                    {refs.people.filter((p) => p.teamId === t.id).length} people
                    {t.description ? ` · ${t.description}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setModal({ kind: "team", team: t })}
                    aria-label="Edit"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setModal({ kind: "delete-team", team: t })}
                    aria-label="Delete"
                  >
                    <Trash2 className="size-3.5 text-tag-red" />
                  </Button>
                </div>
              </div>
            ))}
          </Panel>
        </section>
      </div>

      <Dialog
        open={modal?.kind === "person"}
        onClose={close}
        title={modal?.kind === "person" && modal.person ? "Edit person" : "Add person"}
      >
        {modal?.kind === "person" && (
          <ActionForm
            key={modal.person?.id ?? "new"}
            action={modal.person ? updatePersonAction : createPersonAction}
            hidden={modal.person ? { id: modal.person.id } : { projectId }}
            submitLabel={modal.person ? "Save" : "Add person"}
            cancel={close}
            onSuccess={close}
          >
            <TextField name="name" label="Name" required autoFocus defaultValue={modal.person?.name} />
            <TextField
              name="role"
              label="Role"
              defaultValue={modal.person?.role ?? ""}
              placeholder="Backend lead, QA, Vendor PM…"
            />
            <TextField name="email" label="Email" type="email" defaultValue={modal.person?.email ?? ""} />
            <SelectField
              name="teamId"
              label="Team"
              defaultValue={modal.person?.teamId ?? ""}
              placeholder="No team"
              options={refs.teams.map((t) => ({ value: t.id, label: t.name }))}
            />
          </ActionForm>
        )}
      </Dialog>

      <Dialog
        open={modal?.kind === "team"}
        onClose={close}
        title={modal?.kind === "team" && modal.team ? "Edit team" : "Add team"}
      >
        {modal?.kind === "team" && (
          <ActionForm
            key={modal.team?.id ?? "new"}
            action={modal.team ? updateTeamAction : createTeamAction}
            hidden={modal.team ? { id: modal.team.id } : { projectId }}
            submitLabel={modal.team ? "Save" : "Add team"}
            cancel={close}
            onSuccess={close}
          >
            <TextField
              name="name"
              label="Name"
              required
              autoFocus
              defaultValue={modal.team?.name}
              placeholder="Team B — Backend API"
            />
            <TextareaField name="description" label="Description" defaultValue={modal.team?.description ?? ""} />
          </ActionForm>
        )}
      </Dialog>

      <Dialog open={modal?.kind === "delete-person"} onClose={close} title="Remove person">
        {modal?.kind === "delete-person" && (
          <ActionForm
            action={deletePersonAction}
            hidden={{ id: modal.person.id, projectId }}
            submitLabel="Remove"
            danger
            cancel={close}
            onSuccess={close}
          >
            <p className="text-body-sm text-ink-muted">
              Remove <span className="font-medium text-ink">{modal.person.name}</span>? Their tasks and risks become
              unassigned.
            </p>
          </ActionForm>
        )}
      </Dialog>

      <Dialog open={modal?.kind === "delete-team"} onClose={close} title="Remove team">
        {modal?.kind === "delete-team" && (
          <ActionForm
            action={deleteTeamAction}
            hidden={{ id: modal.team.id, projectId }}
            submitLabel="Remove"
            danger
            cancel={close}
            onSuccess={close}
          >
            <p className="text-body-sm text-ink-muted">
              Remove <span className="font-medium text-ink">{modal.team.name}</span>? People in it stay but lose the
              team.
            </p>
          </ActionForm>
        )}
      </Dialog>
    </div>
  );
}
