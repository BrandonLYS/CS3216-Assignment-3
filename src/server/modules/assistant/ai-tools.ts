import { tool, type ToolApprovalConfiguration, type ToolSet } from "ai";
import { z } from "zod";
import type { Ctx } from "@/server/core/context";
import { DomainError } from "@/server/core/errors";
import { toolPermissionsRepo } from "./repository";
import type { ToolDef } from "./tools";

/** Convert service results to plain JSON so the AI SDK's ModelMessage schema accepts them. */
function toJSON(value: unknown): unknown {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

/** Fields the route binds server-side: hidden from the model and injected into the handler input. */
const SCOPE_KEYS = ["projectId", "conversationId"] as const;
export type ToolScope = Partial<Record<(typeof SCOPE_KEYS)[number], string>>;

function bindScope(def: ToolDef, scope?: ToolScope) {
  const keys = SCOPE_KEYS.filter((k) => scope?.[k] && k in def.input.shape);
  const shape = Object.fromEntries(Object.entries(def.input.shape).filter(([k]) => !keys.includes(k as never)));
  const inputSchema = keys.length ? z.object(shape) : def.input;
  const inject = (input: Record<string, unknown>) =>
    keys.length ? { ...input, ...Object.fromEntries(keys.map((k) => [k, scope![k]])) } : input;
  return { inputSchema, inject };
}

/**
 * Adapt registry entries to AI SDK tools for one chat turn. Scope values (`projectId`,
 * `conversationId`) are bound server-side and removed from the model-facing schema, so the model
 * cannot point a dock at a Conversation or Project it was not opened on. Domain errors come back
 * as `{ error }` so the model can recover.
 */
export function toAiTools(ctx: Ctx, defs: ToolDef[], scope?: ToolScope): ToolSet {
  return Object.fromEntries(
    defs.map((def) => {
      const { inputSchema, inject } = bindScope(def, scope);
      return [
        def.name,
        tool({
          description: def.description,
          inputSchema,
          execute: async (input: Record<string, unknown>) => {
            try {
              const result = await def.handler(ctx, inject(input));
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
 * User already always-allowed it in this scope - the grant is then applied automatically (ADR 0011).
 * The card's text comes from the tool's `describe` when it has one. Read tools run straight away.
 */
export async function toolApprovalFor(
  ctx: Ctx,
  defs: ToolDef[],
  scope?: ToolScope,
): Promise<ToolApprovalConfiguration<ToolSet, never>> {
  const granted = new Set(await toolPermissionsRepo.listToolNames(ctx.db, ctx.userId, scope?.projectId ?? null));
  return Object.fromEntries(
    defs
      .filter((d) => d.mutates)
      .map((def) => {
        const { inject } = bindScope(def, scope);
        return [
          def.name,
          async (input: Record<string, unknown>) => {
            if (granted.has(def.name)) return { type: "approved" as const, reason: "Always allowed in this scope" };
            try {
              return { type: "user-approval" as const, reason: await def.describe?.(ctx, inject(input)) };
            } catch (e) {
              // e.g. the target no longer exists: deny with the reason instead of failing the turn.
              if (e instanceof DomainError) return { type: "denied" as const, reason: e.message };
              throw e;
            }
          },
        ];
      }),
  );
}
