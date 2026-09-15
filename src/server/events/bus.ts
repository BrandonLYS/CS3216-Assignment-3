import type { ActivityAction, EntityType } from "@/shared/domain";
import type { FieldChange } from "@/server/core/diff";

/**
 * Domain event published after every committed mutation (ADR 0005).
 * The future intelligence module subscribes here; nothing else should need to.
 */
export interface DomainEvent {
  name: `${EntityType}.${ActivityAction}`;
  projectId: string;
  actorId: string | null;
  entityType: EntityType;
  entityId: string;
  entityLabel: string;
  action: ActivityAction;
  changes: FieldChange[];
  occurredAt: Date;
}

export type EventHandler = (event: DomainEvent) => void | Promise<void>;

class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  /** Subscribe to a specific event name or `"*"` for everything. Returns an unsubscribe fn. */
  subscribe(name: DomainEvent["name"] | "*", handler: EventHandler) {
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
