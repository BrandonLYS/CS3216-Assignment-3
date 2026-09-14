---
status: accepted
---

# Postgres with Drizzle as the only persistence layer

The base app is CRUD, and SQLite or an in-memory store would have been faster to start. We chose Postgres (Docker locally, Neon in production) with Drizzle from day one because the planned AI layer needs pgvector for retrieval over Evidence and JSONB for extracted project facts; migrating a half-built product between databases mid-course is the cost we are avoiding. Drizzle over Prisma because its schema is plain TypeScript, it emits SQL we can read, and it has no engine binary to ship to serverless.
