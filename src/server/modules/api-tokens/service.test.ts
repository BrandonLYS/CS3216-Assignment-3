import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ctx } from "@/server/core/context";
import { ForbiddenError } from "@/server/core/errors";
import { closeDb, makeCtx } from "@/test/helpers";
import { apiTokensService } from "./service";

let ctx: Ctx;

beforeAll(async () => {
  ctx = await makeCtx();
});
afterAll(closeDb);

describe("apiTokensService", () => {
  it("issues a token shown once, stores only its hash and resolves it to the User", async () => {
    const { token, row } = await apiTokensService.create(ctx, "Claude Desktop");
    expect(token).toMatch(/^vtg_[A-Za-z0-9_-]{32,}$/);
    expect(row.prefix).toBe(token.slice(0, 12));
    const listed = await apiTokensService.list(ctx);
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(token);
    expect(await apiTokensService.resolve(ctx.db, token)).toBe(ctx.userId);
    expect((await apiTokensService.list(ctx))[0]?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("rejects unknown and revoked tokens", async () => {
    expect(await apiTokensService.resolve(ctx.db, "vtg_nope")).toBeNull();
    const { token, row } = await apiTokensService.create(ctx, "Cursor");
    await apiTokensService.revoke(ctx, row.id);
    expect(await apiTokensService.resolve(ctx.db, token)).toBeNull();
    expect((await apiTokensService.list(ctx)).find((t) => t.id === row.id)?.revokedAt).toBeInstanceOf(Date);
  });

  it("only lets the owner revoke", async () => {
    const { row } = await apiTokensService.create(ctx, "Mine");
    const stranger = await makeCtx();
    await expect(apiTokensService.revoke(stranger, row.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
