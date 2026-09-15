---
status: accepted
---

# Per-project Statuses that map to fixed Status Categories

Users wanted to rename and add their own statuses per Project. Fully free-form statuses would break every consumer that needs meaning: the Timeline cannot tell "done" from "not started", the board cannot order columns, and the future AI cannot classify "In QA". We therefore store `Status` rows per Project (name, colour, order, editable via CRUD) and require each to map to exactly one system-defined `StatusCategory` enum value (Tasks: `not_started | in_progress | blocked | done | cancelled`; Milestones: `planned | at_risk | reached | missed`; Risks: `open | monitoring | mitigated | closed`).

New Projects are seeded with a default status set. A Status cannot be deleted while items reference it.

## Consequences

- All logic (rollups, colours in the Timeline, "what changed") keys off `category`, never off the user-visible name.
- Probability/impact and Project RAG health remain plain enums: they are scales, not workflows.
