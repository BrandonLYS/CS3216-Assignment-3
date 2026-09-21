import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eventBus, type DomainEvent } from "@/server/events/bus";
import { activityRepo } from "@/server/modules/activity/service";
import { peopleRepo } from "@/server/modules/people/repository";
import { peopleService } from "@/server/modules/people/service";
import type { ProjectRow } from "@/server/modules/projects/schema";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import type { Ctx, ParticipantCtx } from "./context";
import { mutateAsParticipant } from "./mutation";

let ctx: Ctx;
let project: ProjectRow;
let pctx: ParticipantCtx;

beforeAll(async () => {
  ctx = await makeCtx();
  project = await makeProject(ctx, "MUT");
  const person = await peopleService.createPerson(ctx, { projectId: project.id, name: "Mei Chen" });
  pctx = { db: ctx.db, person: { id: person.id, projectId: project.id } };
});
afterAll(closeDb);

/** An explicit limit above the default page, so counting rows cannot hit it. */
const eventsOf = () => activityRepo.recentForProject(ctx.db, project.id, 500);

/**
 * ADR 0009 and ADR 0010: a Participant has no `user` row to be the actor of an Activity Event,
 * and the only mutation they make needs none. This is the guard that keeps the nullable actor
 * from becoming a quiet hole in a Project's history.
 */
describe("a mutation with no actor", () => {
  it("publishes a signal with a null actor", async () => {
    const received: DomainEvent[] = [];
    const unsub = eventBus.subscribe("chat_message.created", (e) => void received.push(e));
    const before = (await eventsOf()).length;
    await mutateAsParticipant(pctx, async (_tx, rec) => {
      rec.signal("chat_message.created", {
        projectId: project.id,
        entityType: "chat_message",
        entityId: "msg-1",
        entityLabel: "Room",
        action: "created",
        changes: [],
      });
    });
    unsub();

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ name: "chat_message.created", actorId: null, via: null });
    expect((await eventsOf()).length).toBe(before);
  });

  it("refuses to record an Activity Event, and rolls the transaction back when it tries", async () => {
    const before = (await eventsOf()).length;
    const people = await peopleRepo.listByProject(ctx.db, project.id);
    await expect(
      mutateAsParticipant(pctx, async (tx, rec) => {
        // A row first, so the rejection has something to undo.
        const person = await peopleRepo.insert(tx, { projectId: project.id, name: "Rolled Back" });
        rec.created("person", project.id, person.id, person.name);
      }),
    ).rejects.toThrow(/actor-less/);

    expect(await peopleRepo.listByProject(ctx.db, project.id)).toHaveLength(people.length);
    expect((await eventsOf()).length).toBe(before);
  });
});
