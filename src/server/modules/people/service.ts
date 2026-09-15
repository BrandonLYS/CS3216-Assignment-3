import type { Ctx } from "@/server/core/context";
import { compactPatch, diffFields } from "@/server/core/diff";
import { NotFoundError, ValidationError } from "@/server/core/errors";
import { mutate } from "@/server/core/mutation";
import type { DbOrTx } from "@/server/db/client";
import { assertOwnsProject } from "@/server/modules/projects/service";
import { peopleRepo, teamsRepo } from "./repository";
import type { CreatePersonInput, CreateTeamInput, UpdatePersonInput, UpdateTeamInput } from "./validation";

/** Ensure an optional Person/Team reference belongs to the same project. */
export async function assertPersonInProject(db: DbOrTx, projectId: string, personId?: string | null) {
  if (!personId) return;
  const p = await peopleRepo.findById(db, personId);
  if (!p || p.projectId !== projectId) throw new ValidationError("Invalid person", { assigneeId: ["Invalid"] });
}

export async function assertTeamInProject(db: DbOrTx, projectId: string, teamId?: string | null) {
  if (!teamId) return;
  const t = await teamsRepo.findById(db, teamId);
  if (!t || t.projectId !== projectId) throw new ValidationError("Invalid team", { teamId: ["Invalid"] });
}

export const peopleService = {
  list: async (ctx: Ctx, projectId: string) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    const [persons, teamRows] = await Promise.all([
      peopleRepo.listByProject(ctx.db, projectId),
      teamsRepo.listByProject(ctx.db, projectId),
    ]);
    return { people: persons, teams: teamRows };
  },

  createPerson: (ctx: Ctx, input: CreatePersonInput) =>
    mutate(ctx, async (tx, rec) => {
      await assertOwnsProject(tx, ctx.userId, input.projectId);
      await assertTeamInProject(tx, input.projectId, input.teamId);
      const person = await peopleRepo.insert(tx, input);
      rec.created("person", input.projectId, person.id, person.name);
      return person;
    }),

  updatePerson: (ctx: Ctx, { id, ...patch }: UpdatePersonInput) =>
    mutate(ctx, async (tx, rec) => {
      const before = await peopleRepo.findById(tx, id);
      if (!before) throw new NotFoundError("Person");
      await assertOwnsProject(tx, ctx.userId, before.projectId);
      const clean = compactPatch(patch);
      await assertTeamInProject(tx, before.projectId, clean.teamId);
      const changes = diffFields(before, clean);
      if (!changes.length) return before;
      const after = await peopleRepo.update(tx, id, clean);
      rec.updated("person", before.projectId, id, after.name, changes);
      return after;
    }),

  deletePerson: (ctx: Ctx, id: string) =>
    mutate(ctx, async (tx, rec) => {
      const person = await peopleRepo.findById(tx, id);
      if (!person) throw new NotFoundError("Person");
      await assertOwnsProject(tx, ctx.userId, person.projectId);
      await peopleRepo.delete(tx, id);
      rec.deleted("person", person.projectId, id, person.name);
    }),

  createTeam: (ctx: Ctx, input: CreateTeamInput) =>
    mutate(ctx, async (tx, rec) => {
      await assertOwnsProject(tx, ctx.userId, input.projectId);
      const team = await teamsRepo.insert(tx, input);
      rec.created("team", input.projectId, team.id, team.name);
      return team;
    }),

  updateTeam: (ctx: Ctx, { id, ...patch }: UpdateTeamInput) =>
    mutate(ctx, async (tx, rec) => {
      const before = await teamsRepo.findById(tx, id);
      if (!before) throw new NotFoundError("Team");
      await assertOwnsProject(tx, ctx.userId, before.projectId);
      const clean = compactPatch(patch);
      const changes = diffFields(before, clean);
      if (!changes.length) return before;
      const after = await teamsRepo.update(tx, id, clean);
      rec.updated("team", before.projectId, id, after.name, changes);
      return after;
    }),

  deleteTeam: (ctx: Ctx, id: string) =>
    mutate(ctx, async (tx, rec) => {
      const team = await teamsRepo.findById(tx, id);
      if (!team) throw new NotFoundError("Team");
      await assertOwnsProject(tx, ctx.userId, team.projectId);
      await teamsRepo.delete(tx, id);
      rec.deleted("team", team.projectId, id, team.name);
    }),
};
