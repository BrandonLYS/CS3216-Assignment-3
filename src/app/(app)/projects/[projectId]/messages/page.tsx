import { ctxForCurrentUser } from "@/server/core/action";
import { messagingService } from "@/server/modules/messaging/service";
import { peopleService } from "@/server/modules/people/service";
import { MessagesView } from "@/features/messaging/messages-view";
import type { RosterPerson } from "@/features/messaging/room-dialogs";

export const metadata = { title: "Messages" };

/** Newest 50; scrolling back through older pages is issue #60. */
const PAGE = 50;

export default async function MessagesPage({ params, searchParams }: PageProps<"/projects/[projectId]/messages">) {
  const { projectId } = await params;
  const { room } = await searchParams;
  const ctx = await ctxForCurrentUser();
  const [rooms, roster] = await Promise.all([messagingService.listRoomsWithParticipants(ctx, projectId), loadRoster()]);
  // Matched against the Rooms already read, so a stale or invented `?room=` falls back to the
  // first Room instead of 404-ing the page.
  const selected = (typeof room === "string" ? rooms.find((r) => r.room.id === room) : undefined) ?? rooms[0] ?? null;
  const messages = selected
    ? await messagingService.listMessages(ctx, { projectId, roomId: selected.room.id }, { limit: PAGE })
    : [];
  return (
    <MessagesView
      projectId={projectId}
      rooms={rooms}
      selected={selected}
      messages={messages}
      viewer={{ kind: "pm", userId: ctx.userId, roster }}
    />
  );

  /** The Project's People with the state of their messaging login, for the two PM dialogs. */
  async function loadRoster(): Promise<RosterPerson[]> {
    const [{ people }, states] = await Promise.all([
      peopleService.list(ctx, projectId),
      messagingService.listInviteStates(ctx, projectId),
    ]);
    const byPerson = new Map(states.map((s) => [s.personId, s]));
    return people.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      state: byPerson.get(p.id)?.state ?? "none",
      inviteExpiresAt: byPerson.get(p.id)?.inviteExpiresAt ?? null,
    }));
  }
}
