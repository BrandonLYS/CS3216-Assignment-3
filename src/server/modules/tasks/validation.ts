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
