import { ctxForCurrentUser } from "@/server/core/action";
import { messagingService } from "@/server/modules/messaging/service";
import { MessagesView } from "@/features/messaging/messages-view";

export const metadata = { title: "Messages" };

/** Newest 50; scrolling back through older pages is issue #60. */
const PAGE = 50;

export default async function MessagesPage({ params, searchParams }: PageProps<"/projects/[projectId]/messages">) {
  const { projectId } = await params;
  const { room } = await searchParams;
  const ctx = await ctxForCurrentUser();
  const rooms = await messagingService.listRoomsWithParticipants(ctx, projectId);
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
      currentUserId={ctx.userId}
    />
  );
}
