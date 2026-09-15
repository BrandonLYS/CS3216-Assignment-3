import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "@/server/db/client";

/** Migrate the test database once per run. Requires `docker compose up -d db_test`. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  const db = createDb(url);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.$client.end();
}
