import { tool, type Tool } from "ai";
import type { Ctx } from "@/server/core/context";
import { DomainError } from "@/server/core/errors";
import type { ToolDef } from "./tools";

/**
 * Adapt registry entries to AI SDK tools for one chat turn. When a scope is given, `projectId`
 * is bound server-side and removed from the model-facing schema, so the model cannot point a
 * Project dock at another Project. Domain errors come back as `{ error }` so the model can recover.
 */
export function toAiTools(ctx: Ctx, defs: ToolDef[], scope?: { projectId: string }): Record<string, Tool> {
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
