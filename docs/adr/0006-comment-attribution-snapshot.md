---
status: accepted
---

# Comments snapshot the attributed Person's name, and created/deleted Activity Events may carry a payload

A Comment is attributed to a Person through `comments.said_by_id`, a nullable FK with `ON DELETE SET NULL` so that removing a contractor from a Project never erases what they said. On its own that FK makes two very different states look identical once the Person is gone: "the PM recorded this as their own observation" and "this was attributed to someone who has since been removed". The UI must distinguish them ("You" vs "Unknown person"), so the Comment also stores `said_by_name`, the Person's name at posting time. The live name is still read through the FK while the Person exists; the snapshot is only a fallback and a tooltip.

The same Comment feature needs deletion to keep the body in the item's history. `Recorder.created/deleted` previously wrote Activity Event rows with `field/oldValue/newValue = NULL`, so they gained an optional `snapshot` argument: `flush` writes it to `newValue` (created) or `oldValue` (deleted), `field` stays `NULL` so existing feed rendering is untouched. For Comments the snapshot is `{ entityType, entityId, body, saidById, saidByName, saidOn }` — the parent item reference is included on purpose so per-item history can select Comment events with a jsonb containment query after the Comment row is gone.

## Considered options

- No name snapshot, render "Unknown person" whenever `said_by_id` is null: wrong for the common case of an unattributed Comment, which must read as the PM's own statement.
- Soft-delete People instead of `SET NULL`: a much wider change to the People module for one display string, and People are per-Project (ADR 0004) so an archived Person would need its own UI.
- Store the body in `entityLabel` only: the label is truncated display text; history needs the full body and the parent reference.

## Consequences

- `comments` has one column the issue's schema list did not name (`said_by_name`); it is derived data and never edited.
- `DomainEvent.snapshot?` is available to other modules that need a payload on create/delete events (e.g. Evidence links); it is optional and existing subscribers and tests are unaffected.
- Activity Event `oldValue`/`newValue` are no longer guaranteed `NULL` for `created`/`deleted` rows; consumers must branch on `action`, not on the presence of a value.
