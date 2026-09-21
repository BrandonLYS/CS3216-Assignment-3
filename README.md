# PrismPM - CS3216 Assignment 3

Project management with a memory: the structured base (projects, tasks, milestones, dependencies, risks, evidence, per-project statuses, full change history) for an AI project-intelligence layer that comes next. See `CS3216 Assignment 3.pdf` for the product journeys, `CONTEXT.md` for the domain glossary, and `docs/adr/` for decisions.

New contributors should follow the [developer onboarding guide](docs/developer-onboarding.md) for prerequisites, local setup, testing, and repository conventions.

The [architecture guide](docs/architecture.md) maps the UI, services, repositories, PostgreSQL, AI, authentication, storage, messaging, and analytics, with end-to-end diagrams and implementation links.
For the Assistant and MCP internals, see the [AI system guide](docs/ai-system-guide.md).

## Brand and compatibility

The product name is **PrismPM**; package names, MCP server identity, and other technical identifiers use `prismpm`.
The repository remains `BrandonLYS/CS3216-Assignment-3`, so existing clone URLs and checkout paths still apply.

New personal API tokens start with `prismpm_`.
Previously issued `vtg_` tokens continue to authenticate and can still be revoked.
The Assistant dock migrates `vantage.assistant-open` to `prismpm.assistant-open` on first use, preserving an existing new-key preference and removing the legacy key after a successful migration.
The Participant session cookie retains its legacy `vantage_participant` name to preserve signed-in sessions.
Accounts, Project data, database names, and deployment configuration are unchanged.

The prism logo uses the existing design tokens; regenerate its browser icon with `npm run brand:icons` after changing the shared logo or palette.
This command requires Playwright Chromium (`npx playwright install chromium`).
Archived screenshots and historical command output retain the branding and paths from when they were captured.

## Run locally

```bash
cp .env.example .env          # then set BETTER_AUTH_SECRET to something random
npm install
npm run db:up                 # Postgres (dev on :5433, test on :5434) via Docker
npm run db:migrate
npm run db:seed               # demo@example.com / demo-password-123 with the PDF scenario
npm run dev                   # landing page on http://localhost:3000, workspace on /dashboard
```

## Verify

```bash
npm run typecheck && npm run lint
npm test                      # Vitest against the test database
npm run test:e2e              # Playwright smoke (uses the running dev server)
```

## Drive it from an MCP client

The Assistant's tools are also served over MCP at `/api/mcp` (Streamable HTTP), authenticated with a personal token.

1. Sign in, open **Settings** in the sidebar, and under **API tokens** generate one. Copy it; it is shown once.
2. Point your client at the endpoint with the token as a bearer header. Claude Desktop (`claude_desktop_config.json`) and Cursor accept:

   ```json
   {
     "mcpServers": {
       "prismpm": {
         "url": "https://<your-host>/api/mcp",
         "headers": { "Authorization": "Bearer prismpm_..." }
       }
     }
   }
   ```

   Clients that only speak stdio can use `npx -y mcp-remote https://<your-host>/api/mcp --header "Authorization: Bearer prismpm_..."`.

3. Call `list_projects` to discover ids, then any Project-scoped tool with its `projectId`. Every change lands in History via Assistant. Tools that need a confirm card (`delete_task`, `delete_milestone`, `update_project`) are not offered over MCP.
4. Revoke the token from the same page when you are done.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Postgres + Drizzle · Better Auth · Vitest · Playwright. Deploy target: Vercel + Neon, with `STORAGE_DRIVER=vercel-blob` for Evidence files.
