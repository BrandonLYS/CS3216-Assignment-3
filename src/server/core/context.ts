import type { Db } from "@/server/db/client";
import type { Via } from "@/shared/domain";

/** Everything a service needs to act on behalf of a signed-in user. */
export interface Ctx {
  db: Db;
  userId: string;
  /** Present when the Assistant or Reflection acts for the User; stamped on every Activity Event. */
  via?: Via;
}
