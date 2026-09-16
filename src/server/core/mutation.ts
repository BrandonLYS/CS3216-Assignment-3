import type { Tx } from "@/server/db/client";
import { activityEvents, type NewActivityEventRow } from "@/server/modules/activity/schema";
import { eventBus, type DomainEvent, type DomainEventName } from "@/server/events/bus";
import type { EntityType } from "@/shared/domain";
import type { Ctx } from "./context";
import type { FieldChange } from "./diff";

/**
 * Collects Activity Events during a transaction, writes them before commit,
 * and publishes the corresponding domain events after commit.
 */
export class Recorder {
  private pending: DomainEvent[] = [];
  private signals: DomainEvent[] = [];

  constructor(private readonly actorId: string) {}

  /** `snapshot`, when given, is stored as the Activity Event's `newValue` (e.g. a Comment body). */
  created(entityType: EntityType, projectId: string, entityId: string, entityLabel: string, snapshot?: unknown) {
    this.push(entityType, projectId, entityId, entityLabel, "created", [], snapshot);
  }

  updated(entityType: EntityType, projectId: string, entityId: string, entityLabel: string, changes: FieldChange[]) {
    if (changes.length) this.push(entityType, projectId, entityId, entityLabel, "updated", changes);
  }

  /** `snapshot`, when given, is stored as the Activity Event's `oldValue` so history keeps the content. */
  deleted(entityType: EntityType, projectId: string, entityId: string, entityLabel: string, snapshot?: unknown) {
    this.push(entityType, projectId, entityId, entityLabel, "deleted", [], snapshot);
  }

  /** Queue a domain event that has no Activity Event of its own (published after commit, not persisted). */
  signal(
    name: DomainEventName,
    e: Pick<DomainEvent, "projectId" | "entityType" | "entityId" | "entityLabel" | "changes">,
  ) {
    this.signals.push({ ...e, name, action: "updated", actorId: this.actorId, occurredAt: new Date() });
  }

  private push(
    entityType: EntityType,
    projectId: string,
    entityId: string,
    entityLabel: string,
    action: DomainEvent["action"],
    changes: FieldChange[],
    snapshot?: unknown,
  ) {
    this.pending.push({
      name: `${entityType}.${action}`,
      projectId,
      actorId: this.actorId,
      entityType,
      entityId,
      entityLabel,
      action,
      changes,
      snapshot,
      occurredAt: new Date(),
    });
  }

  async flush(tx: Tx) {
    const rows: NewActivityEventRow[] = this.pending.flatMap((e) => {
      const base = {
        projectId: e.projectId,
        actorId: e.actorId,
        entityType: e.entityType,
        entityId: e.entityId,
        entityLabel: e.entityLabel,
        action: e.action,
        occurredAt: e.occurredAt,
      };
      if (e.action !== "updated") {
        if (e.snapshot === undefined) return [base];
        return [{ ...base, ...(e.action === "created" ? { newValue: e.snapshot } : { oldValue: e.snapshot }) }];
      }
      return e.changes.map((c) => ({
        ...base,
        field: c.field,
        oldValue: c.oldValue,
        newValue: c.newValue,
      }));
    });
    if (rows.length) await tx.insert(activityEvents).values(rows);
  }

  async publish() {
    const events = [...this.pending, ...this.signals];
    this.pending = [];
    this.signals = [];
    await eventBus.publish(events);
  }
}

/** Run `fn` in a transaction; activity is persisted with it and events published on commit. */
export async function mutate<T>(ctx: Ctx, fn: (tx: Tx, rec: Recorder) => Promise<T>): Promise<T> {
  const rec = new Recorder(ctx.userId);
  const result = await ctx.db.transaction(async (tx) => {
    const r = await fn(tx, rec);
    await rec.flush(tx);
    return r;
  });
  await rec.publish();
  return result;
}
