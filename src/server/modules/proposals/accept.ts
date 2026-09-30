import { z } from "zod";
import { ValidationError } from "@/server/core/errors";
import { createMilestoneSchema, type CreateMilestoneInput } from "@/server/modules/milestones/validation";
import { createTaskSchema, type CreateTaskInput } from "@/server/modules/tasks/validation";
import type { ItemProposalRow, ProposedMilestoneFields, ProposedTaskFields } from "./schema";
import { byName, type TraceRefs } from "./trace";

/** The Project's current People and Milestones, against which a Proposal's names and ids are re-checked. */
export type AcceptRefs = Pick<TraceRefs, "people" | "milestones">;

export type ItemAcceptInput =
  { kind: "task"; input: CreateTaskInput } | { kind: "milestone"; input: CreateMilestoneInput };

/** The id when it still exists in the Project, else whatever the name resolves to now, else null. */
const resolve = (rows: Array<{ id: string; name: string }>, id: string | null, name: string | null) =>
  (id && rows.some((r) => r.id === id) ? id : byName(rows, name, (r) => r.name)?.id) ?? null;

function parsed<S extends z.ZodType>(schema: S, value: z.input<S>): z.infer<S> {
  const res = schema.safeParse(value);
  if (res.success) return res.data;
  throw new ValidationError(
    "That proposal cannot be accepted as it stands; edit it first",
    z.flattenError(res.error).fieldErrors as Record<string, string[]>,
  );
}

/**
 * The exact create input a one-click accept submits (issue #115), and what the review dialog
 * prefills. Ids resolved at pass time are re-checked, so a Person or Milestone deleted since is
 * dropped, and a name that was unresolved then (a Milestone that was itself still a Proposal) is
 * resolved again now. Re-validated by the create schema: the stored payload is never trusted.
 */
export function acceptInputOf(
  projectId: string,
  item: Pick<ItemProposalRow, "kind" | "fields">,
  refs: AcceptRefs,
): ItemAcceptInput {
  if (item.kind === "milestone") {
    const f = item.fields as ProposedMilestoneFields;
    return {
      kind: "milestone",
      input: parsed(createMilestoneSchema, {
        projectId,
        name: f.name,
        description: f.description,
        dueDate: f.dueDate,
        ownerId: resolve(refs.people, f.ownerId, f.ownerName),
      }),
    };
  }
  const f = item.fields as ProposedTaskFields;
  const startDate = f.startDate && f.dueDate && f.startDate > f.dueDate ? null : f.startDate;
  return {
    kind: "task",
    input: parsed(createTaskSchema, {
      projectId,
      title: f.title,
      description: f.description,
      assigneeId: resolve(refs.people, f.assigneeId, f.assigneeName),
      milestoneId: resolve(refs.milestones, f.milestoneId, f.milestoneName),
      startDate,
      dueDate: f.dueDate,
    }),
  };
}
