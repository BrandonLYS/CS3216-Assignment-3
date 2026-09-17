import { z } from "zod";
import {
  optionalDate,
  optionalId,
  optionalText,
  parseJsonIfString,
  requiredDate,
  requiredText,
} from "@/server/core/validation";
import { ASSUMPTION_SUBTYPES, ASSUMPTION_TARGET_TYPES, DATE_TARGET_FIELDS, SOURCE_KINDS } from "@/shared/domain";

export const sourceInputSchema = z.object({
  kind: z.enum(SOURCE_KINDS),
  entityId: z.string().min(1),
  passageId: z.string().nullable().optional(),
});
export type SourceInput = z.infer<typeof sourceInputSchema>;

const sourcesField = z.preprocess(parseJsonIfString, z.array(sourceInputSchema).min(1, "Add at least one source"));

export const createDecisionSchema = z.object({
  projectId: z.string(),
  title: requiredText("Title", 200),
  decidedOn: requiredDate,
  ownerId: optionalId,
  context: optionalText,
  chosen: requiredText("What was chosen", 4000),
  alternatives: optionalText,
  revisitWhen: optionalText,
  supersedesId: optionalId,
  sources: sourcesField,
});

export const updateDecisionSchema = z.object({
  id: z.string(),
  title: requiredText("Title", 200).optional(),
  decidedOn: requiredDate.optional(),
  ownerId: optionalId,
  status: z.enum(["active", "revisited"]).optional(),
  context: optionalText,
  chosen: requiredText("What was chosen", 4000).optional(),
  alternatives: optionalText,
  revisitWhen: optionalText,
  sources: sourcesField.optional(),
});

export const supersedeDecisionSchema = z.object({
  id: z.string(),
  /** Decision this one replaces; null clears the link and restores the earlier one to active. */
  supersedesId: z.string().nullable(),
});

/** Form selects post "" for "nothing chosen"; treat it as null so the subtype matrix reports the real error. */
const emptyToNull = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === "" ? null : v), schema);

const assumptionShape = z.object({
  projectId: z.string(),
  decisionId: z.string(),
  statement: requiredText("Statement", 500),
  subtype: z.enum(ASSUMPTION_SUBTYPES, { message: "Choose a subtype" }),
  targetType: emptyToNull(z.enum(ASSUMPTION_TARGET_TYPES).nullable().optional()),
  targetId: optionalId,
  targetField: emptyToNull(z.enum(DATE_TARGET_FIELDS).nullable().optional()),
  assumedUntil: optionalDate,
});
type AssumptionShape = z.infer<typeof assumptionShape>;

/**
 * The subtype decides what the Assumption must point at (ADR 0008). Returned as field errors so
 * both the form (via the schema) and direct service callers (via `assertAssumptionShape`) agree.
 */
export function assumptionFieldErrors(v: AssumptionShape): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  const need = (path: string, message: string) => (errors[path] = [...(errors[path] ?? []), message]);
  switch (v.subtype) {
    case "date":
      if ((v.targetType !== "task" && v.targetType !== "milestone") || !v.targetId)
        need("targetId", "Pick a Task or Milestone");
      if (!v.targetField) need("targetField", "Pick which date");
      if (v.targetType === "milestone" && v.targetField && v.targetField !== "dueDate")
        need("targetField", "Milestones only have a due date");
      if (!v.assumedUntil) need("assumedUntil", "Enter the date this holds until");
      break;
    case "person":
      if (v.targetType !== "person" || !v.targetId) need("targetId", "Pick a Person");
      break;
    case "dependency":
      if (v.targetType !== "dependency" || !v.targetId) need("targetId", "Pick a Dependency");
      break;
    case "external_rule":
      if (v.targetType || v.targetId || v.targetField || v.assumedUntil)
        need("targetId", "An external rule has no target");
      break;
  }
  return errors;
}

export const createAssumptionSchema = assumptionShape.superRefine((v, ctx) => {
  for (const [path, messages] of Object.entries(assumptionFieldErrors(v)))
    for (const message of messages) ctx.addIssue({ code: "custom", path: [path], message });
});

export const attachAssumptionSchema = z.object({ decisionId: z.string(), assumptionId: z.string() });
export const retireAssumptionSchema = z.object({ id: z.string() });

export type CreateDecisionInput = z.infer<typeof createDecisionSchema>;
export type UpdateDecisionInput = z.infer<typeof updateDecisionSchema>;
export type SupersedeDecisionInput = z.infer<typeof supersedeDecisionSchema>;
export type CreateAssumptionInput = z.infer<typeof createAssumptionSchema>;
export type AttachAssumptionInput = z.infer<typeof attachAssumptionSchema>;
