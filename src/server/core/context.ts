import type { Db } from "@/server/db/client";

/** Everything a service needs to act on behalf of a signed-in user. */
export interface Ctx {
  db: Db;
  userId: string;
}
