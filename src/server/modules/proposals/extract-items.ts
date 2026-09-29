import { z } from "zod";

/**
 * Item extractor contract (issue #114, ADR 0015): Tasks and Milestones the team committed to,
 * read from the same Sources as the Decision pass by a separate call with its own prompt. The
 * pass traces every claim afterwards (`traceItems`), so an extractor is never trusted.
 */

const citedSources = z.array(
  z.object({ kind: z.enum(["evidence", "comment"]), entityId: z.string(), excerpt: z.string() }),
);

export const rawTaskSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  /** Name of the Person doing the work; resolved by the pass. */
  assigneeName: z.string().nullable(),
  /** Name of the Milestone the Task rolls up to; resolved by the pass. */
  milestoneName: z.string().nullable(),
  startDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  sources: citedSources,
});

export const rawMilestoneSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  dueDate: z.string().nullable(),
  ownerName: z.string().nullable(),
  sources: citedSources,
});

export type RawTask = z.infer<typeof rawTaskSchema>;
export type RawMilestone = z.infer<typeof rawMilestoneSchema>;
export interface RawItems {
  tasks: RawTask[];
  milestones: RawMilestone[];
}
