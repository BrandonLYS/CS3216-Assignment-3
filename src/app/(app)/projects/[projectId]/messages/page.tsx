import { redirect } from "next/navigation";
import { db } from "@/server/db/client";
import { getViewer } from "@/server/auth/viewer";
import { ctxForCurrentUser } from "@/server/core/action";
import { messagingService, participantMessagingService } from "@/server/modules/messaging/service";
import { peopleService } from "@/server/modules/people/service";
import { MessagesView, type RoomListItem } from "@/features/messaging/messages-view";
import { ParticipantHeader } from "@/features/messaging/participant-header";
import type { RosterPerson } from "@/features/messaging/room-dialogs";

export const metadata = { title: "Messages" };

/** Newest 50; scrolling back through older pages is issue #60. */
const PAGE = 50;

/**
 * One route, two audiences (ADR 0009). The PM sees this inside Vantage with the tools to
 * create a Room; a Person sees only the Rooms they were admitted to, with no shell at all.
 */
export default async function MessagesPage({ params, searchParams }: PageProps<"/projects/[projectId]/messages">) {
  const { projectId } = await params;
  const { room } = await searchParams;
  const requested = typeof room === "string" ? room : undefined;
  const viewer = await getViewer();
  return viewer?.kind === "participant"
    ? participantView(projectId, requested, viewer.session)
    : pmView(projectId, requested);
}

async function pmView(projectId: string, requested: string | undefined) {
  const ctx = await ctxForCurrentUser();
  const [rooms, roster] = await Promise.all([messagingService.listRoomsWithParticipants(ctx, projectId), loadRoster()]);
  const selected = pick(rooms, requested);
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

async function participantView(
  projectId: string,
  requested: string | undefined,
  session: { personId: string; projectId: string },
) {
  // The session names one Project, and it is not this one: send them to their own rather than
  // reading anything here. `assertParticipates` would refuse it in any case.
  if (session.projectId !== projectId) redirect(`/projects/${session.projectId}/messages`);
  const pctx = { db, person: { id: session.personId, projectId } };
  const { project, person, rooms } = await participantMessagingService.workspace(pctx);
  const selected = pick(rooms, requested);
  const messages = selected
    ? await participantMessagingService.listMessages(pctx, { projectId, roomId: selected.room.id }, { limit: PAGE })
    : [];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ParticipantHeader projectName={project.name} personName={person.name} />
      <MessagesView
        projectId={projectId}
        rooms={rooms}
        selected={selected}
        messages={messages}
        viewer={{ kind: "participant", personId: person.id }}
      />
    </div>
  );
}

/**
 * Matched against the Rooms already read, so a stale or invented `?room=` falls back to the
 * first Room instead of 404-ing the page - and, for a Participant, cannot open a Room that is
 * not theirs, because it was never in the list.
 */
const pick = (rooms: RoomListItem[], requested: string | undefined) =>
  (requested ? rooms.find((r) => r.room.id === requested) : undefined) ?? rooms[0] ?? null;
