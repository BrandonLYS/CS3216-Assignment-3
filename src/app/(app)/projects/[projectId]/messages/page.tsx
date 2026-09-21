import { redirect } from "next/navigation";
import { db } from "@/server/db/client";
import { getViewer } from "@/server/auth/viewer";
import { ctxForCurrentUser } from "@/server/core/action";
import { NotFoundError } from "@/server/core/errors";
import { messagingService, participantMessagingService } from "@/server/modules/messaging/service";
import { peopleService } from "@/server/modules/people/service";
import { MESSAGE_PAGE_FIRST } from "@/shared/domain";
import { MessagesView, type RoomListItem } from "@/features/messaging/messages-view";
import { ParticipantHeader } from "@/features/messaging/participant-header";
import type { RosterPerson } from "@/features/messaging/room-dialogs";

export const metadata = { title: "Messages" };

/** The newest page; the pane pulls older ones in through its own action (issue #60). */
const EMPTY_PAGE = { items: [], hasMore: false };

/**
 * One route, two audiences (ADR 0009). The PM sees this inside PrismPM with the tools to
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
  const page = selected
    ? await messagingService.listMessages(ctx, { projectId, roomId: selected.room.id }, { limit: MESSAGE_PAGE_FIRST })
    : EMPTY_PAGE;
  return (
    <MessagesView
      projectId={projectId}
      rooms={rooms}
      selected={selected}
      messages={page.items}
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
  // A Person deleted since the cookie was signed has a session that verifies and names
  // nobody. Back to the login form, which is where they can sign in again or stop; failing
  // here would show an error page with no way off it.
  const workspace = await participantMessagingService.workspace(pctx).catch((e: unknown) => {
    if (e instanceof NotFoundError) redirect(`/m/${projectId}/login`);
    throw e;
  });
  const { project, person, rooms } = workspace;
  const selected = pick(rooms, requested);
  const page = selected
    ? await participantMessagingService.listMessages(
        pctx,
        { projectId, roomId: selected.room.id },
        { limit: MESSAGE_PAGE_FIRST },
      )
    : EMPTY_PAGE;
  return (
    // `h-screen overflow-hidden` is what `AppShell` gives the PM and what the pane's internal
    // scrolling needs; without it a long history grows the page instead of scrolling itself.
    <div className="flex h-screen flex-col overflow-hidden">
      <ParticipantHeader projectId={projectId} projectName={project.name} personName={person.name} />
      <MessagesView
        projectId={projectId}
        rooms={rooms}
        selected={selected}
        messages={page.items}
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
