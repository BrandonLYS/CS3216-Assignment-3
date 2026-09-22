import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ctx } from "@/server/core/context";
import { ForbiddenError, ValidationError } from "@/server/core/errors";
import { activityRepo } from "@/server/modules/activity/service";
import { peopleRepo } from "@/server/modules/people/repository";
import { people } from "@/server/modules/people/schema";
import { peopleService } from "@/server/modules/people/service";
import type { ProjectRow } from "@/server/modules/projects/schema";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import { participantsService } from "./service";

let ctx: Ctx;
let outsider: Ctx;
let project: ProjectRow;
let sibling: ProjectRow;

/** Each test picks its own address: the test database is not reset between runs. */
const address = () => `${randomUUID()}@example.test`;

const addPerson = (p: ProjectRow, email?: string, name = "Jason Lim") =>
  peopleService.createPerson(ctx, { projectId: p.id, name, email });

const invite = (personId: string, p: ProjectRow = project, as: Ctx = ctx) =>
  participantsService.createInvite(as, { projectId: p.id, personId });

const accept = (token: string, password = "a-long-enough-password") =>
  participantsService.acceptInvite({ token, password, confirm: password });

beforeAll(async () => {
  ctx = await makeCtx();
  outsider = await makeCtx();
  project = await makeProject(ctx, "MSG");
  sibling = await makeProject(ctx, "SIB");
});
afterAll(closeDb);

describe("issuing an invite", () => {
  it("hands out a token once and stores only its hash", async () => {
    const person = await addPerson(project, address());
    const { token, expiresAt } = await invite(person.id);
    expect(token).toHaveLength(32);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    const [row] = await ctx.db
      .select({ hash: people.inviteTokenHash, password: people.passwordHash })
      .from(people)
      .where(eq(people.id, person.id));
    expect(row!.hash).toBeTruthy();
    expect(row!.hash).not.toBe(token);
    expect(row!.password).toBeNull();
  });

  it("records one Activity Event that carries no hash", async () => {
    const person = await addPerson(project, address(), "Invited Person");
    await invite(person.id);
    const events = await activityRepo.recentForProject(ctx.db, project.id, 20);
    const mine = events.filter((e) => e.event.entityId === person.id && e.event.field === "messaging_invite");
    expect(mine).toHaveLength(1);
    expect(mine[0]!.event).toMatchObject({ entityType: "person", action: "updated", newValue: "sent", oldValue: null });
  });

  it("refuses a Person with no email", async () => {
    const person = await addPerson(project);
    await expect(invite(person.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses a second Person on an address that already signs in, case-insensitively", async () => {
    const shared = address();
    const first = await addPerson(project, shared);
    await invite(first.id);
    const second = await addPerson(project, shared.toUpperCase());
    await expect(invite(second.id)).rejects.toThrow(/already signs in/);
  });

  it("allows two uninvited People to share an address", async () => {
    const shared = address();
    await addPerson(project, shared);
    const second = await addPerson(project, shared);
    // Neither holds credentials, so `people_project_email_uq` does not cover them; the first
    // Person to be invited claims the address.
    await expect(invite(second.id)).resolves.toMatchObject({ token: expect.any(String) });
  });

  it("refuses a Person from another Project, whoever owns it", async () => {
    const person = await addPerson(project, address());
    await expect(invite(person.id, sibling)).rejects.toBeInstanceOf(ValidationError);
    await expect(invite(person.id, project, outsider)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("invalidates the previous link when it is re-issued", async () => {
    const person = await addPerson(project, address());
    const { token: first } = await invite(person.id);
    await invite(person.id);
    await expect(accept(first)).rejects.toThrow(/no longer valid/);
  });
});

describe("accepting an invite", () => {
  it("sets a password, burns the token and returns the session", async () => {
    const person = await addPerson(project, address());
    const { token } = await invite(person.id);
    expect(await accept(token)).toEqual({ personId: person.id, projectId: project.id });
    const [row] = await ctx.db
      .select({ hash: people.inviteTokenHash, password: people.passwordHash, expires: people.inviteExpiresAt })
      .from(people)
      .where(eq(people.id, person.id));
    expect(row).toMatchObject({ hash: null, expires: null });
    expect(row!.password).toBeTruthy();
  });

  it("refuses the same token twice", async () => {
    const person = await addPerson(project, address());
    const { token } = await invite(person.id);
    await accept(token);
    await expect(accept(token)).rejects.toThrow(/no longer valid/);
  });

  it("refuses an expired token with the message an unknown one gets", async () => {
    const person = await addPerson(project, address());
    const { token } = await invite(person.id);
    await ctx.db
      .update(people)
      .set({ inviteExpiresAt: sql`now() - interval '1 second'` })
      .where(eq(people.id, person.id));
    await expect(accept(token)).rejects.toThrow(/no longer valid/);
    await expect(accept("not-a-real-token")).rejects.toThrow(/no longer valid/);
    // The expiry is in the UPDATE's own WHERE, so the row is untouched rather than half-written.
    const [row] = await ctx.db.select({ password: people.passwordHash }).from(people).where(eq(people.id, person.id));
    expect(row!.password).toBeNull();
  });

  it("names the invitee and the Project while the link is live, and nothing afterwards", async () => {
    const person = await addPerson(project, address(), "Sarah Tan");
    const { token } = await invite(person.id);
    expect(await participantsService.invitee(token)).toMatchObject({
      person: { name: "Sarah Tan" },
      project: { id: project.id },
    });
    await accept(token);
    expect(await participantsService.invitee(token)).toBeNull();
  });
});

describe("signing in", () => {
  it("accepts the password that was set, and rejects everything else identically", async () => {
    const email = address();
    const person = await addPerson(project, email);
    const { token } = await invite(person.id);
    await accept(token, "correct-horse-battery");

    expect(
      await participantsService.login({ projectId: project.id, email, password: "correct-horse-battery" }),
    ).toEqual({ personId: person.id, projectId: project.id });
    // The address is matched the way the unique index is.
    await expect(
      participantsService.login({
        projectId: project.id,
        email: email.toUpperCase(),
        password: "correct-horse-battery",
      }),
    ).resolves.toMatchObject({ personId: person.id });

    // Thunks, not promises: a rejected promise built ahead of its `await` is an unhandled one.
    const attempts = [
      () => participantsService.login({ projectId: project.id, email, password: "not-the-password" }),
      () => participantsService.login({ projectId: project.id, email: address(), password: "anything-at-all" }),
      () => participantsService.login({ projectId: sibling.id, email, password: "correct-horse-battery" }),
    ];
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toThrow(/Incorrect email or password/);
    }
  });

  it("refuses a Person who holds an invite but has never set a password", async () => {
    const email = address();
    const person = await addPerson(project, email);
    await invite(person.id);
    await expect(
      participantsService.login({ projectId: project.id, email, password: "anything-at-all" }),
    ).rejects.toThrow(/Incorrect email or password/);
  });
});

describe("the messaging state of a Project's People", () => {
  it("reports none, invited and active, and never a hash", async () => {
    const p = await makeProject(ctx, "STA");
    const none = await peopleService.createPerson(ctx, { projectId: p.id, name: "No invite", email: address() });
    const invited = await peopleService.createPerson(ctx, { projectId: p.id, name: "Invited", email: address() });
    const active = await peopleService.createPerson(ctx, { projectId: p.id, name: "Active", email: address() });
    await participantsService.createInvite(ctx, { projectId: p.id, personId: invited.id });
    const { token } = await participantsService.createInvite(ctx, { projectId: p.id, personId: active.id });
    await accept(token);

    const states = await peopleRepo.listMessagingStates(ctx.db, p.id);
    const by = (id: string) => states.find((s) => s.personId === id)!;
    expect(by(none.id).state).toBe("none");
    expect(by(invited.id).state).toBe("invited");
    expect(by(active.id).state).toBe("active");
    expect(Object.keys(states[0]!)).toEqual(["personId", "state", "inviteExpiresAt"]);
  });
});
