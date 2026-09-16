---
status: accepted
---

# Every mutation goes through a service that records an Activity Event and publishes a domain event

The AI layer that follows this base app is about "what changed since I last looked". Retrofitting history is painful, so from the start all writes go through `src/server/modules/<feature>/service.ts`. Each service call (a) performs the write in a transaction, (b) inserts an immutable `ActivityEvent` row per changed field, and (c) publishes a typed event (`task.updated`, `milestone.changed`, ...) on an in-process bus in `src/server/events`.

Exception: `project.deleted` is publish-only (`rec.signal`). A Project's Activity Events cascade away with the row, so there is no parent for an `ActivityEvent` to reference; the Activity feed of a deleted Project is unreachable anyway.

UI code (server actions, route handlers, pages) never imports a repository directly; the future `intelligence` module subscribes to the bus and reads through the same repositories.

## Considered options

- Database triggers for the audit log: rejected because the actor and the domain-level "why" are not available in the trigger.
- A real queue now: unnecessary; `publish()` is the seam and can be re-pointed at a queue later.

## Consequences

- Layout: FSD-style layers on the client (`app / widgets / features / entities / shared`), vertical slices on the server (`server/modules/*`), shared domain types in `src/shared/domain`.
