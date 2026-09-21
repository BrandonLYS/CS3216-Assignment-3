import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/server/core/context";
import { ValidationError } from "@/server/core/errors";
import { closeDb, makeCtx } from "@/test/helpers";
import { aiConfigService } from "./service";

let owner: Ctx;
let stranger: Ctx;
const key = Buffer.alloc(32, 9).toString("base64");
const succeeds = vi.fn(async () => {});

beforeAll(async () => {
  owner = await makeCtx();
  stranger = await makeCtx();
});
beforeEach(() => {
  vi.stubEnv("AI_CREDENTIALS_ENCRYPTION_KEY", key);
  succeeds.mockClear();
});
afterAll(closeDb);

describe("aiConfigService", () => {
  it("creates a User-owned configuration and returns only a safe summary", async () => {
    await aiConfigService.save(owner, { provider: "openai", model: "gpt-test", apiKey: "sk-plaintext" }, succeeds);
    expect(await aiConfigService.summary(owner)).toEqual({
      provider: "openai",
      model: "gpt-test",
      baseUrl: null,
      hasApiKey: true,
    });
    expect(JSON.stringify(await aiConfigService.summary(owner))).not.toContain("plaintext");
    expect(await aiConfigService.summary(stranger)).toBeNull();
  });

  it("preserves a blank key for the same provider but requires replacement on provider change", async () => {
    await aiConfigService.save(owner, { provider: "openai", model: "gpt-new", apiKey: "" }, succeeds);
    expect((await aiConfigService.summary(owner))?.model).toBe("gpt-new");
    await expect(
      aiConfigService.save(owner, { provider: "anthropic", model: "claude-test", apiKey: "" }, succeeds),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("does not write when provider validation fails and removal restores no personal configuration", async () => {
    const before = await aiConfigService.summary(owner);
    await expect(
      aiConfigService.save(owner, { provider: "openai", model: "bad", apiKey: "replacement" }, async () => {
        throw new Error("secret provider response");
      }),
    ).rejects.toThrow("provider could not validate");
    expect(await aiConfigService.summary(owner)).toEqual(before);
    await aiConfigService.remove(owner);
    expect(await aiConfigService.summary(owner)).toBeNull();
  });

  it("stores, validates, and removes a Google Gemini configuration through the same public seam", async () => {
    await aiConfigService.save(
      owner,
      { provider: "google", model: "gemini-3.8-flash", apiKey: "google-secret" },
      succeeds,
    );
    expect(succeeds).toHaveBeenCalledOnce();
    expect(await aiConfigService.summary(owner)).toEqual({
      provider: "google",
      model: "gemini-3.8-flash",
      baseUrl: null,
      hasApiKey: true,
    });
    expect(JSON.stringify(await aiConfigService.summary(owner))).not.toContain("google-secret");
    await aiConfigService.remove(owner);
    expect(await aiConfigService.summary(owner)).toBeNull();
  });
});
