import { z } from "zod";
import { PRIORITIES } from "@/shared/domain";
import { optionalDate, optionalId, optionalNumber, optionalText, requiredText } from "@/server/core/validation";

/** Absent = leave unchanged; "" = clear all; string | string[] = set. */
const labelIds = z.preprocess(
  (v) => (v === undefined || v === null ? undefined : v === "" ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.string()).optional(),
);

export const createTaskSchema = z.object({
  projectId: z.string(),
  title: requiredText("Title", 200),
  description: optionalText,
  statusId: optionalId,
  priority: z.enum(PRIORITIES).default("none"),
  assigneeId: optionalId,
  teamId: optionalId,
  milestoneId: optionalId,
  startDate: optionalDate,
  dueDate: optionalDate,
  estimateHours: optionalNumber,
  labelIds,
});

export const updateTaskSchema = z.object({
  id: z.string(),
  title: requiredText("Title", 200).optional(),
  description: optionalText,
  statusId: z.string().optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: optionalId,
  teamId: optionalId,
  milestoneId: optionalId,
  startDate: optionalDate,
  dueDate: optionalDate,
  estimateHours: optionalNumber,
  labelIds,
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/** Command-palette Task search: trimmed query of 2–100 chars; `limit` defaults to and is capped at 10. */
export const searchTasksSchema = z.object({
  q: z.string().trim().min(2, "Type at least 2 characters").max(100, "Query is too long"),
  currentProjectId: z.uuid().optional(),
  limit: z.number().int().min(1).max(10).default(10),
});
export type SearchTasksInput = z.infer<typeof searchTasksSchema>;
