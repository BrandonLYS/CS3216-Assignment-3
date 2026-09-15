---
status: accepted
---

# People and Teams are scoped to a single Project

`Person` and `Team` rows belong to one Project rather than to the User's whole workspace. This was chosen over workspace-level people to keep each Project self-contained (import/export, deletion, per-project vendor contacts) and to match how PMs think about a project's roster.

## Consequences

- The same real person on two Projects is two `Person` rows. Cross-project features (the all-projects Dashboard, future multi-project briefings) must treat them as distinct unless a later identity link is added. `Person.userId` (nullable) is the only cross-project hook today.
