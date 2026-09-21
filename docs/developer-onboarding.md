# Developer onboarding

This guide takes a new Vantage developer from a fresh clone to a verified local environment.

## 1. Install prerequisites

Install these tools before cloning the repository:

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/en/download) 20.9 or newer, as required by Next.js 16
- npm, included with Node.js
- [Docker Desktop](https://docs.docker.com/get-started/get-docker/) or another Docker installation with Compose v2

Confirm they are available:

```bash
git --version
node --version
npm --version
docker --version
docker compose version
```

## 2. Clone and install

```bash
git clone git@github.com:BrandonLYS/CS3216-Assignment-3.git
cd CS3216-Assignment-3
npm install
```

`npm install` also configures the Husky Git hooks. The pre-commit hook formats staged files and runs the TypeScript checks.

## 3. Configure environment variables

Create a local environment file from the committed template:

```bash
cp .env.example .env
```

Replace `BETTER_AUTH_SECRET` in `.env` with a long random value. One way to generate it is:

```bash
openssl rand -base64 32
```

The defaults configure:

- the development database at `localhost:5433`;
- the test database at `localhost:5434`;
- local Evidence storage in `./storage`;
- the seeded demo account as `demo@example.com` / `demo-password-123`.

Do not commit `.env` or real credentials. `BLOB_READ_WRITE_TOKEN` is not needed when the default `STORAGE_DRIVER=disk` is used.

## 4. Start and initialize PostgreSQL

Start both development and test databases:

```bash
npm run db:up
```

Apply the committed Drizzle migrations to the development database:

```bash
npm run db:migrate
```

Seed the development database with the demo project and account:

```bash
npm run db:seed
```

You can inspect the development database with Drizzle Studio:

```bash
npm run db:studio
```

## 5. Run the application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the landing page, then sign in at `/login` with the demo credentials from `.env`.
The workspace itself lives at `/dashboard`.

For a production-mode check:

```bash
npm run build
npm start
```

## 6. Run the checks

Keep the `db_test` Docker service running before executing unit and integration tests. `npm run db:up` starts it.

Run the same static checks expected by CI:

```bash
npm run format:check
npm run lint -- --max-warnings=0
npm run typecheck
```

Run the Vitest suite once or in watch mode:

```bash
npm test
npm run test:watch
```

Install Playwright's Chromium browser the first time you run end-to-end tests:

```bash
npx playwright install chromium
```

Then run the end-to-end suite:

```bash
npm run test:e2e
```

Playwright starts the development server automatically and reuses one already listening on port 3000. To use a different port, start the server on that port and pass the same value to Playwright:

```bash
npm run dev -- -p 3001
E2E_PORT=3001 npm run test:e2e
```

## 7. Understand the repository

Read these before making substantial changes:

- `CONTEXT.md`: Vantage domain vocabulary
- `DESIGN.md`: visual language and design tokens
- `AGENTS.md`: architecture rules and verification commands
- `docs/adr/`: architecture decisions and their trade-offs
- `docs/flows.md`: product flows

The main source layers are:

```text
src/app       Routes and server-rendered entry points
src/widgets   Page-level compositions such as shell, timeline, and calendar
src/features  Interactive views and dialogs
src/entities  Domain display components
src/shared    Shared UI, libraries, and domain definitions
src/server    Database, services, repositories, events, and mutations
```

All writes belong in a feature service under `src/server/modules/<feature>/service.ts`; UI code must not import repositories directly. Use the project vocabulary—Task, Person, and Evidence—when naming code and documentation.

## 8. Before opening a pull request

Run the full local verification set:

```bash
npm run format:check
npm run lint -- --max-warnings=0
npm run typecheck
npm test
npm run test:e2e
```

Review the diff, ensure no secrets or generated local files are included, and describe the verification performed in the pull request.

## Troubleshooting

### A database port is already in use

The Docker services bind development PostgreSQL to port 5433 and test PostgreSQL to port 5434. Stop the conflicting local service or change both the Compose port and its matching URL in `.env`.

### Tests cannot connect to PostgreSQL

Run `npm run db:up`, then confirm the `db_test` container is running with `docker compose ps`. Tests use `TEST_DATABASE_URL`, not `DATABASE_URL`.

### The schema changed

After editing `src/server/db/schema.ts`, generate and inspect a migration:

```bash
npm run db:generate
npm run db:migrate
```

Commit the generated migration with the schema change.

### End-to-end tests cannot find a browser

Run `npx playwright install chromium`, then retry `npm run test:e2e`.
