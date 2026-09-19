import { tool, type ToolApprovalConfiguration, type ToolSet } from "ai";
import type { Ctx } from "@/server/core/context";
import { DomainError } from "@/server/core/errors";
import type { ToolDef } from "./tools";

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
          // Database rows contain Dates; model tool results must contain only JSON values.
          toModelOutput: ({ output }) => ({ type: "json", value: JSON.parse(JSON.stringify(output ?? null)) }),
          execute: async (input: Record<string, unknown>) => {
            try {
              return await def.handler(ctx, scoped ? { ...input, projectId: scope.projectId } : input);
            } catch (e) {
              if (e instanceof DomainError) return { error: e.message };
              throw e;
            }
          },
        }),
      ];
    }),
  );
}

/**
 * `streamText` approval policy: tools flagged `requiresConfirmation` stop at a card whose text
 * comes from the tool's `describe`; everything else runs straight away.
 */
export function toolApprovalFor(
  ctx: Ctx,
  defs: ToolDef[],
  scope?: { projectId: string },
): ToolApprovalConfiguration<ToolSet, never> {
  return Object.fromEntries(
    defs
      .filter((d) => d.requiresConfirmation)
      .map((def) => [
        def.name,
        async (input: Record<string, unknown>) => {
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
