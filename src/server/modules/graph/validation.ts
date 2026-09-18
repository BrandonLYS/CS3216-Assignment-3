import { z } from "zod";
import { GRAPH_CENTRE_TYPES } from "@/shared/domain";

export const graphNodeSchema = z.object({ type: z.enum(GRAPH_CENTRE_TYPES), id: z.string().min(1) });
export type GraphCentre = z.infer<typeof graphNodeSchema>;

/** `?node=<type>:<id>` -> centre, or null for anything malformed or not a centre type. */
export function parseNodeParam(raw: string | string[] | undefined): GraphCentre | null {
  if (typeof raw !== "string") return null;
  const i = raw.indexOf(":");
  if (i < 0) return null;
  const parsed = graphNodeSchema.safeParse({ type: raw.slice(0, i), id: raw.slice(i + 1) });
  return parsed.success ? parsed.data : null;
}
