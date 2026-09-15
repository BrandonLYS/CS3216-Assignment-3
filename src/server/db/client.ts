import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export function createDb(url: string) {
  const sql = postgres(url, { max: 10, prepare: false });
  return drizzle(sql, { schema, casing: "snake_case" });
}

const globalForDb = globalThis as unknown as { __db?: Db };

export const db: Db = globalForDb.__db ?? (globalForDb.__db = createDb(requireEnv("DATABASE_URL")));

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}
