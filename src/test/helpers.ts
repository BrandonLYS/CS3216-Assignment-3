import { randomUUID } from "node:crypto";
import { user } from "@/server/auth/schema";
import type { Ctx } from "@/server/core/context";
import { db } from "@/server/db/client";
import { projectsService } from "@/server/modules/projects/service";

/** A fresh user + Ctx; each test gets its own so tests don't see each other's data. */
export async function makeCtx(): Promise<Ctx> {
  const id = randomUUID();
  await db.insert(user).values({ id, name: "Test User", email: `${id}@test.local` });
  return { db, userId: id };
}

export async function makeProject(ctx: Ctx, key = "TST") {
  return projectsService.create(ctx, { name: `Project ${key}`, key });
}

export const closeDb = () => db.$client.end();
