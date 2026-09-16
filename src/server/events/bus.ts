import type { ActivityAction, EntityType, Via } from "@/shared/domain";
import type { FieldChange } from "@/server/core/diff";

/** Derived from the Activity Event, plus link signals that have no Activity Event of their own. */
export type DomainEventName = `${EntityType}.${ActivityAction}` | "evidence.linked" | "evidence.unlinked";

/**
 * Domain event published after every committed mutation (ADR 0005).
 * The future intelligence module subscribes here; nothing else should need to.
 */
export interface DomainEvent {
  name: DomainEventName;
  projectId: string;
  actorId: string | null;
  via: Via | null;
  entityType: EntityType;
  entityId: string;
  entityLabel: string;
  action: ActivityAction;
  changes: FieldChange[];
  /** Optional payload for created/deleted events (e.g. a Comment's body); mirrors the Activity Event's new/old value. */
  snapshot?: unknown;
  occurredAt: Date;
}

export type EventHandler = (event: DomainEvent) => void | Promise<void>;

class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  /** Subscribe to a specific event name or `"*"` for everything. Returns an unsubscribe fn. */
  subscribe(name: DomainEventName | "*", handler: EventHandler) {
    const set = this.handlers.get(name) ?? new Set();
    set.add(handler);
    this.handlers.set(name, set);
    return () => set.delete(handler);
  }

  async publish(events: DomainEvent[]) {
    for (const event of events) {
      const targets = [...(this.handlers.get(event.name) ?? []), ...(this.handlers.get("*") ?? [])];
      await Promise.allSettled(targets.map(async (h) => h(event)));
    }
  }
}

const globalForBus = globalThis as unknown as { __eventBus?: EventBus };
export const eventBus = globalForBus.__eventBus ?? (globalForBus.__eventBus = new EventBus());
