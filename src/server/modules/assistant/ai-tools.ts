import { tool, type ToolApprovalConfiguration, type ToolSet } from "ai";
import type { Ctx } from "@/server/core/context";
import { DomainError } from "@/server/core/errors";
import { toolPermissionsRepo } from "./repository";
import type { ToolDef } from "./tools";

/** Convert service results to plain JSON so the AI SDK's ModelMessage schema accepts them. */
function toJSON(value: unknown): unknown {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Adapt registry entries to AI SDK tools for one chat turn. When a scope is given, `projectId`
 * is bound server-side and removed from the model-facing schema, so the model cannot point a
 * Project dock at another Project. Domain errors come back as `{ error }` so the model can recover.
 */
export function toAiTools(ctx: Ctx, defs: ToolDef[], scope?: { projectId: string }): ToolSet {
  return Object.fromEntries(
    defs.map((def) => {
      const scoped = scope && "projectId" in def.input.shape;
      const inputSchema = scoped ? def.input.omit({ projectId: true }) : def.input;
      return [
        def.name,
        tool({
          description: def.description,
          inputSchema,
          execute: async (input: Record<string, unknown>) => {
            try {
              const result = await def.handler(ctx, scoped ? { ...input, projectId: scope.projectId } : input);
              return toJSON(result);
            } catch (e) {
              if (e instanceof DomainError) return toJSON({ error: e.message });
              throw e;
            }
          },
        }),
      ];
    }),
  );
}

/**
 * `streamText` approval policy: every write tool (`mutates`) stops at an approval card unless the
 * User already always-allowed it in this scope — the grant is then applied automatically (ADR 0011).
 * The card's text comes from the tool's `describe` when it has one. Read tools run straight away.
 */
export async function toolApprovalFor(
  ctx: Ctx,
  defs: ToolDef[],
  scope?: { projectId: string },
): Promise<ToolApprovalConfiguration<ToolSet, never>> {
  const granted = new Set(await toolPermissionsRepo.listToolNames(ctx.db, ctx.userId, scope?.projectId ?? null));
  return Object.fromEntries(
    defs
      .filter((d) => d.mutates)
      .map((def) => [
        def.name,
        async (input: Record<string, unknown>) => {
          if (granted.has(def.name)) return { type: "approved" as const, reason: "Always allowed in this scope" };
          const full = scope && "projectId" in def.input.shape ? { ...input, projectId: scope.projectId } : input;
          try {
            return { type: "user-approval" as const, reason: await def.describe?.(ctx, full) };
          } catch (e) {
            // e.g. the target no longer exists: deny with the reason instead of failing the turn.
            if (e instanceof DomainError) return { type: "denied" as const, reason: e.message };
            throw e;
          }
        },
      ]),
  );
}
