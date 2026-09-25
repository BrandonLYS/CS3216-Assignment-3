---
status: accepted
---

# A Chat Message publishes a domain event but writes no Activity Event

ADR 0005 makes every write go through `mutate(ctx, (tx, rec) => …)` and call `rec.created/updated/deleted`, which writes an `activity_events` row and publishes a domain event from the same call.
Issue #62 brings the messaging writes under that rule.
Rooms and Participants follow it exactly: they are rare, structural, and belong in the Project's history.
A Chat Message does not, and `postMessage` uses `rec.signal("chat_message.created", …)` instead: published after commit, never persisted.

The reason is that an Activity Event for a Chat Message would be a copy of the Chat Message.
`activity_events` records _change_, one row per changed field, so a reader can see what is different since they last looked.
A Chat Message is never updated and never deleted (issue #62 fixes that for the first version, and ADR 0009 keeps it), so `created` is the only event it can ever have, and that row would hold the same Project, author, timestamp and text that `room_messages` already stores immutably.
Compare `comment.created`, which earns its row: its snapshot carries the parent `{entityType, entityId}` that `activityRepo.historyForEntity` needs to gather a Task's Comments out of the event log.
A Chat Message has no parent item to point at, so its snapshot would only point at itself.

The second reason is volume.
`activityRepo.recentForProject` and `recentForProjects`, which feed the Project Overview and the Workspace dashboard, are unfiltered `order by occurred_at desc limit 50/30`.
One busy Room would evict every Task, Risk and Decision event from both.
That is repairable with one `ne()` in two queries, which is why it is the second reason and not the first, but it is a filter every future reader of `activity_events` would have to remember, and forgetting it fails silently.

Not a reason: leaking message text.
Every reader of `activity_events` is behind `assertOwnsProject`, so a Participant never sees one.
The problem is duplication, not exposure.

The rejected alternative is to call `rec.created` and teach each activity reader to filter `entity_type <> 'chat_message'`.
That buys the same feed with a second copy of the messaging table underneath it and a filter that every new reader must be told about.

## What the event carries

`Recorder.signal` publishes a strictly smaller event than `rec.created` does, so what a subscriber may rely on is worth stating:

- `name` is `chat_message.created`, and `action` is passed **explicitly** as `created`; `signal` defaults `action` to `updated`, which would contradict the name.
- `entityId` is the Chat Message id. A subscriber reads the row itself through `messagingRepo`.
- `entityLabel` is the Room's label, not a preview of the text. The text lives in one place.
- `changes` is empty, `snapshot` is absent (the parameter type of `signal` has no room for one), and there is no `activityEventId`, because no Activity Event row exists to point at.

Issue #59's SSE fan-out and the future intelligence layer both refetch by id, so neither needs more than this.

## Who the actor is (issue #55)

A Chat Message written by a Participant carries `actorId: null`, and so does any other event an actor-less mutation publishes.

A Person has no `user` row and never will (ADR 0009), while `activity_events.actor_id` is a foreign key to one, so `mutate`'s `Recorder` had no actor to take.
The Person's id is not an answer: a subscriber reading `actorId` cannot tell a Person id from a User id, and every other event in the system means "a User" by it.
The Chat Message row names its own author in `author_person_id` and the `author_name` snapshot, and the event is a notification rather than a payload, so nothing is lost by saying "not a User" plainly.

The mechanism is `mutateAsParticipant(pctx, fn)` beside `mutate(ctx, fn)`, sharing one implementation of transaction, flush, commit and publish.
`Recorder.actorId` became nullable for it, and `Recorder` throws if such a mutation calls `created`, `updated` or `deleted`: an actor-less mutation may signal and may not record.
That guard is what keeps the nullable actor from becoming a quiet way to write an authorless row into a Project's history.

Two contexts rather than one union, because `Ctx` and `ParticipantCtx` are deliberately distinct types (ADR 0009): a union on `mutate` would let a Person id reach any of the roughly forty existing callers, all of which pass their `userId` to `assertOwnsProject`.

`via` is null for the same kind of reason: `Via` names the Assistant, Reflection and the system acting **for the User**, and a Participant acts for nobody.

## Consequences

- There are now two exceptions to "every mutation records an Activity Event": `project.deleted`, because the Project's events cascade away with the row, and `chat_message.created`, for the reasons above. AGENTS.md names both.
- A Project's history will never show what was said in a Room, only that a Room was created and who was admitted to it. That is the intended reading of ADR 0009's separation between the messaging surface and the Project.
- If PrismPM ever wants "3 new messages" in the activity feed, the answer is a read model over `room_messages`, not an Activity Event per Chat Message.
- A subscriber that needs the text must read `room_messages` by `entityId`. The event is a notification, not a payload.
- A subscriber must handle `actorId: null`, which `DomainEvent` has always allowed. Any subscriber that needs to know who spoke reads the Chat Message row.
