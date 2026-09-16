import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ctx } from "@/server/core/context";
import { ForbiddenError, ValidationError } from "@/server/core/errors";
import { eventBus, type DomainEvent } from "@/server/events/bus";
import { activityRepo } from "@/server/modules/activity/service";
import type { ProjectRow } from "@/server/modules/projects/schema";
import type { RiskRow } from "@/server/modules/risks/schema";
import { risksService } from "@/server/modules/risks/service";
import type { TaskRow } from "@/server/modules/tasks/schema";
import { tasksService } from "@/server/modules/tasks/service";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import { evidenceService } from "./service";

let ctx: Ctx;
let project: ProjectRow;
let projectId: string;
let task: TaskRow;
let risk: RiskRow;

beforeAll(async () => {
  ctx = await makeCtx();
  project = await makeProject(ctx);
  projectId = project.id;
  task = await tasksService.create(ctx, { projectId, title: "Integrate gateway", priority: "none" });
  risk = await risksService.create(ctx, { projectId, title: "Vendor slips", probability: "medium", impact: "medium" });
});
afterAll(closeDb);

/** Body-only Evidence: no storage call. */
const mkEvidence = (title = "Weekly sync minutes", over: { projectId?: string } = {}) =>
  evidenceService.create(ctx, {
    projectId: over.projectId ?? projectId,
    title,
    kind: "minutes",
    sourceDate: "2026-09-12",
    body: "Notes.",
  });

const linkTo = (evidenceId: string, entityType: "task" | "risk" | "milestone", entityId: string) =>
  evidenceService.link(ctx, { projectId, evidenceId, entityType, entityId });

const evidenceEvents = async (entityId: string) =>
  (await activityRepo.forEntity(ctx.db, entityId))
    .map((h) => h.event)
    .filter((e) => e.action === "updated" && e.field === "evidence")
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

describe("evidenceService links", () => {
  it("links Evidence to a Task and a Risk and lists it from both sides", async () => {
    const ev = await mkEvidence("Minutes — both sides");
    await linkTo(ev.id, "task", task.id);
    await linkTo(ev.id, "risk", risk.id);

    const onTask = await evidenceService.listForEntity(ctx, projectId, "task", task.id);
    expect(onTask.filter((l) => l.evidenceId === ev.id)).toHaveLength(1);
    expect(onTask.find((l) => l.evidenceId === ev.id)).toMatchObject({
      evidenceTitle: "Minutes — both sides",
      evidenceKind: "minutes",
      entityLabel: task.title,
    });

    const fromEvidence = await evidenceService.listForEvidence(ctx, ev.id);
    expect(fromEvidence).toHaveLength(2);
    expect(fromEvidence.map((l) => l.entityLabel).sort()).toEqual([risk.title, task.title].sort());
    expect(fromEvidence.every((l) => typeof l.entityNumber === "number")).toBe(true);
    expect(fromEvidence.find((l) => l.entityType === "task")?.entityNumber).toBe(task.number);
    expect(fromEvidence.find((l) => l.entityType === "risk")?.entityNumber).toBe(risk.number);
  });

  it("treats linking the same pair twice as a no-op with one row and one Activity Event", async () => {
    const t = await tasksService.create(ctx, { projectId, title: "Idempotent", priority: "none" });
    const ev = await mkEvidence("Twice");
    const first = await linkTo(ev.id, "task", t.id);
    const second = await linkTo(ev.id, "task", t.id);
    expect(second).toMatchObject({ evidenceId: ev.id, entityType: "task", entityId: t.id });
    expect(second.createdAt.getTime()).toBe(first.createdAt.getTime());

    expect(await evidenceService.listForEntity(ctx, projectId, "task", t.id)).toHaveLength(1);
    expect(await evidenceEvents(t.id)).toHaveLength(1);
  });

  it("rejects Evidence from a different Project", async () => {
    const other = await makeProject(ctx, "OTH");
    const foreignEvidence = await mkEvidence("Elsewhere", { projectId: other.id });
    await expect(linkTo(foreignEvidence.id, "task", task.id)).rejects.toBeInstanceOf(ValidationError);

    const foreignTask = await tasksService.create(ctx, { projectId: other.id, title: "Elsewhere", priority: "none" });
    const local = await mkEvidence("Local");
    await expect(linkTo(local.id, "task", foreignTask.id)).rejects.toBeInstanceOf(ValidationError);
    expect(await evidenceService.listForEvidence(ctx, local.id)).toEqual([]);
  });

  it("does not list links of an item from another Project the User also owns", async () => {
    const other = await makeProject(ctx, "OTB");
    const foreignTask = await tasksService.create(ctx, { projectId: other.id, title: "Foreign", priority: "none" });
    const foreignEvidence = await mkEvidence("Foreign minutes", { projectId: other.id });
    await evidenceService.link(ctx, {
      projectId: other.id,
      evidenceId: foreignEvidence.id,
      entityType: "task",
      entityId: foreignTask.id,
    });
    expect(await evidenceService.listForEntity(ctx, other.id, "task", foreignTask.id)).toHaveLength(1);
    // Ownership of `projectId` is asserted, but the item belongs to a different Project.
    expect(await evidenceService.listForEntity(ctx, projectId, "task", foreignTask.id)).toEqual([]);
  });

  it("removes links when the Evidence is deleted", async () => {
    const t = await tasksService.create(ctx, { projectId, title: "Loses its source", priority: "none" });
    const ev = await mkEvidence("Doomed evidence");
    await linkTo(ev.id, "task", t.id);
    await evidenceService.delete(ctx, ev.id);
    expect(await evidenceService.listForEntity(ctx, projectId, "task", t.id)).toEqual([]);
  });

  it("removes links when the Task is deleted", async () => {
    const t = await tasksService.create(ctx, { projectId, title: "Doomed task", priority: "none" });
    const ev = await mkEvidence("Survives the task");
    await linkTo(ev.id, "task", t.id);
    await tasksService.delete(ctx, t.id);
    expect(await evidenceService.listForEvidence(ctx, ev.id)).toEqual([]);
  });

  it("records updated Activity Events on the Task for link and unlink and publishes evidence.linked/unlinked", async () => {
    const t = await tasksService.create(ctx, { projectId, title: "Audited", priority: "none" });
    const ev = await mkEvidence("Audit trail");
    const received: DomainEvent[] = [];
    const unsubs = [
      eventBus.subscribe("evidence.linked", (e) => void received.push(e)),
      eventBus.subscribe("evidence.unlinked", (e) => void received.push(e)),
    ];
    await linkTo(ev.id, "task", t.id);
    await evidenceService.unlink(ctx, { projectId, evidenceId: ev.id, entityType: "task", entityId: t.id });
    unsubs.forEach((u) => u());

    const events = await evidenceEvents(t.id);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      entityType: "task",
      entityLabel: t.title,
      oldValue: null,
      newValue: "Audit trail",
    });
    expect(events[1]).toMatchObject({
      entityType: "task",
      entityLabel: t.title,
      oldValue: "Audit trail",
      newValue: null,
    });
    // Nothing recorded against the Evidence itself (would double up the Overview feed).
    const onEvidence = await activityRepo.forEntity(ctx.db, ev.id);
    expect(onEvidence.map((h) => h.event.action)).toEqual(["created"]);

    expect(received.map((e) => e.name)).toEqual(["evidence.linked", "evidence.unlinked"]);
    expect(received[0]).toMatchObject({ entityType: "evidence", entityId: ev.id, entityLabel: "Audit trail" });
    expect(received[0]!.changes[0]!.newValue).toEqual({ entityType: "task", entityId: t.id });
    expect(received[1]).toMatchObject({ entityType: "evidence", entityId: ev.id });
    expect(received[1]!.changes[0]!.oldValue).toEqual({ entityType: "task", entityId: t.id });

    expect(await evidenceService.listForEntity(ctx, projectId, "task", t.id)).toEqual([]);
  });

  it("tasksService.list reports linkedEvidenceCount per Task", async () => {
    const a = await tasksService.create(ctx, { projectId, title: "Sourced", priority: "none" });
    const b = await tasksService.create(ctx, { projectId, title: "Unsourced", priority: "none" });
    const e1 = await mkEvidence("Plan v4");
    const e2 = await mkEvidence("Status update");
    await linkTo(e1.id, "task", a.id);
    await linkTo(e2.id, "task", a.id);

    const rows = await tasksService.list(ctx, projectId);
    expect(rows.find((r) => r.task.id === a.id)?.linkedEvidenceCount).toBe(2);
    expect(rows.find((r) => r.task.id === b.id)?.linkedEvidenceCount).toBe(0);
  });

  it("refuses a foreign User", async () => {
    const stranger = await makeCtx();
    const ev = await mkEvidence("Owner only");
    await expect(
      evidenceService.link(stranger, { projectId, evidenceId: ev.id, entityType: "task", entityId: task.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(evidenceService.listForEntity(stranger, projectId, "task", task.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(evidenceService.listForEvidence(stranger, ev.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("evidenceService text extraction", () => {
  const upload = (name: string, type: string, bytes: Buffer) =>
    evidenceService.create(ctx, { projectId, title: name, kind: "minutes" }, { name, type, size: bytes.length, bytes });

  it("stores the text of an uploaded Markdown file in extractedText", async () => {
    const bytes = await readFile(path.join(__dirname, "../../../test/fixtures/minutes.md"));
    const ev = await upload("minutes.md", "text/markdown", bytes);
    expect(ev.extractedText).toContain("UAT begins in week 6.");
    expect(ev.extractedText).toBe(bytes.toString("utf8").trim());
  });

  it("leaves extractedText null for a file type without an extractor", async () => {
    const ev = await upload(
      "sheet.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      Buffer.from("PK\u0003\u0004not really a sheet"),
    );
    expect(ev.extractedText).toBeNull();
  });

  it("does not fail the upload when extraction fails", async () => {
    const ev = await upload("broken.pdf", "application/pdf", Buffer.from("%PDF-1.7 garbage"));
    expect(ev.extractedText).toBeNull();
    expect(ev.storageKey).toBeTruthy();
  });

  it("caps extractedText at EVIDENCE_EXTRACT_MAX_CHARS", async () => {
    process.env.EVIDENCE_EXTRACT_MAX_CHARS = "10";
    try {
      const ev = await upload("long.txt", "text/plain", Buffer.from("abcdefghijklmnopqrstuvwxyz"));
      expect(ev.extractedText).toBe("abcdefghij");
    } finally {
      delete process.env.EVIDENCE_EXTRACT_MAX_CHARS;
    }
  });
});
