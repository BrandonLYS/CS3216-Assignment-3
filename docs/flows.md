# End-to-end user flows

Each flow below is exercised by `e2e/flows.spec.ts` against a fresh account. The spec writes numbered
screenshots to `docs/<flow>/screenshots/` on every run, so regenerate them with:

```bash
npm run dev                                  # in one terminal
E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts
```

| Flow              | What is verified                                                                                                                                                                                   | Screenshots                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `auth`            | Anonymous redirect to `/login?next=…`, sign up, sign out, rejected wrong password, sign in                                                                                                         | [auth](./auth/screenshots)                       |
| `project`         | Create a Project from the empty state, land on its Overview, see it in the Projects list                                                                                                           | [project](./project/screenshots)                 |
| `people`          | Add a Team, add People to it, edit a Person's role, remove a Person                                                                                                                                | [people](./people/screenshots)                   |
| `settings`        | Edit Project details (health, dates), add a custom Status with a Category, add Labels, cancel Project delete                                                                                       | [settings](./settings/screenshots)               |
| `tasks`           | Create Tasks (owner, team, label, dates), edit Status, list groups by Status, board view, delete from dialog                                                                                       | [tasks](./tasks/screenshots)                     |
| `timeline`        | Add a Milestone, attach a Task to it, add a Dependency, reject a cycle, see bars and edges on the Gantt, zoom                                                                                      | [timeline](./timeline/screenshots)               |
| `risks`           | Record Risks with probability/impact/owner/mitigation, severity ordering, close a Risk, "Show closed" toggle                                                                                       | [risks](./risks/screenshots)                     |
| `evidence`        | Add pasted-text Evidence, upload a file, edit notes, delete                                                                                                                                        | [evidence](./evidence/screenshots)               |
| `overview`        | Project Overview lists Activity Events for the above; workspace Dashboard lists the Project                                                                                                        | [overview](./overview/screenshots)               |
| `calendar`        | Workspace and project Calendars show Task due dates and Milestones; clicking an event opens the Task                                                                                               | [calendar](./calendar/screenshots)               |
| `command-palette` | ⌘K opens the palette, jumps to a Project and to a section                                                                                                                                          | [command-palette](./command-palette/screenshots) |
| `comments`        | Open a Task, post a Comment attributed to a Person with a said-on date, see it in the thread and the count on the row/board, delete it with confirmation, see created/deleted in the Overview feed | [comments](./comments/screenshots)               |
| `attention`       | Seed an overdue Task, a blocked Task and a slipping Dependency; Overview groups them by rule with reasons; Dashboard shows per-Project counts; item opens its Task                                 | [attention](./attention/screenshots)             |
| `task-search`     | ⌘K searches Tasks across Projects by key (case/hyphen tolerant) and title, shows Project + Status, Enter opens the Task dialog                                                                     | [task-search](./task-search/screenshots)         |
