import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { Ctx } from "@/server/core/context";
import { DomainError } from "@/server/core/errors";
import { db } from "@/server/db/client";
import { apiTokensService } from "@/server/modules/api-tokens/service";
import { MCP_TOOLS } from "@/server/modules/assistant/tools";

export const maxDuration = 60;

/**
 * MCP is a thin adapter over the Assistant tool registry (ADR 0007): every non-confirmation tool
 * is registered as-is, so adding a registry entry adds an MCP tool with no code here. A personal
 * API token identifies the User; the tool then runs under their Ctx, via "assistant".
 */
const handler = createMcpHandler(
  (server) => {
    for (const tool of MCP_TOOLS) {
      server.registerTool(tool.name, { description: tool.description, inputSchema: tool.input }, async (input, mcp) => {
        const userId = mcp.http?.authInfo?.extra?.userId;
        if (typeof userId !== "string") return { isError: true, content: [{ type: "text", text: "Unauthorized" }] };
        const ctx: Ctx = { db, userId, via: "assistant" };
        try {
          const result = await tool.handler(ctx, input);
          return { content: [{ type: "text", text: JSON.stringify(result ?? null) }] };
        } catch (e) {
          if (e instanceof DomainError) return { isError: true, content: [{ type: "text", text: e.message }] };
          throw e;
        }
      });
    }
  },
  { serverInfo: { name: "prismpm", version: "1.0.0" } },
);

const authed = withMcpAuth(
  handler,
  async (_req, token) => {
    const userId = token ? await apiTokensService.resolve(db, token) : null;
    return userId ? { token: token!, clientId: userId, scopes: [], extra: { userId } } : undefined;
  },
  { required: true },
);

export { authed as GET, authed as POST };
