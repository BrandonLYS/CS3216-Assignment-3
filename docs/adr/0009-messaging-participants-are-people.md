---
status: accepted
---

# Messaging Participants are People with a login, not Users

Messaging (issues #53-#62) needs two audiences in one Project: the PM, who runs it, and the people they talk to.
ADR 0002 makes tenancy single-user - a Project has one owning User and `assertOwnsProject` is the only authorization seam - so the second audience cannot be Users without unpicking that decision.

A Participant is therefore a **Person** (ADR 0004), and a Person may be given credentials on their own row: `people.password_hash`, plus `people.invite_token_hash` and `people.invite_expires_at` for a single-use invite link the PM generates.
A Person who signs in reaches a messaging-only surface that shows their Rooms and nothing else.
The PM keeps the whole of Vantage and reaches messaging as one more Project tab.

This was chosen over adding a `project_members` table and widening `assertOwnsProject` to owner-or-member.
That option makes Participants real Users, which reads well against the issue text, but it changes the meaning of the single seam that guards every Task, Risk, Decision and Evidence read in the product.
Every existing service would silently start admitting a second class of caller, and each would need re-auditing to decide whether that is safe.
Keeping the seam untouched and adding a second, much smaller one next to it is the cheaper thing to be wrong about.

`people.user_id` is deliberately **not** the login mechanism, despite already pointing at `user.id`.
ADR 0004 introduced it as a cross-project identity hook: it records that a Person happens to be someone who also holds an account, typically another PM appearing in this Project's roster.
Promoting a Participant to a real `user` row to let them sign in would hand them a workspace, Projects of their own, and everything `assertOwnsProject` is built to protect - the opposite of "can only see the messages".
The two columns coexist and do not interact: `user_id` stays an identity link, `password_hash` is a messaging-only credential.

## Consequences

- There are two authorization seams, not one. `assertOwnsProject` covers every PM path; `assertParticipates` (issue #54, with the invite flow that gives it a caller) covers the Person path and must be the first line of every service a Participant can reach. A reviewer's question on any messaging service is "which seam guards this, and is it the right one".
- Credentials are per Project, because a Person is per Project. The same human on two Projects is two Person rows and signs in twice. This follows directly from ADR 0004 and is accepted for the same reasons.
- The member surface must never render Vantage navigation, the Assistant dock or the command palette. Reusing the `/projects/[id]/messages` route for both audiences (issue #58) means the shell is chosen by viewer, so a leaked link shows a Participant only their own Rooms.
- `room_messages.author_user_id` and `room_messages.author_person_id` both exist and both are nullable, so a Chat Message keeps a real foreign key whichever audience wrote it. Attribution survives either row being deleted through the `author_name` snapshot, exactly as ADR 0006 does for Comments.
- A Person's password is a weaker credential than a User's: there is no email verification, no reset flow and no session management beyond a signed cookie in the first version. Nothing behind it is worth more than the Chat Messages of one Project, which is the reason the surface is kept that narrow.

The following were settled while implementing issue #54.

- The session is a cookie of our own, `vantage_participant`: base64url `{ personId, projectId, exp }` with an HMAC-SHA256 signature under `BETTER_AUTH_SECRET`, valid for 30 days. Not better-auth, whose session row points at `user.id`. Reusing better-auth's secret rather than adding one to configure means rotating it signs every Participant out, which is acceptable for a credential this narrow. The signature covers the Project id, so one cookie speaks for exactly one Project.
- A Person's own credential writes - accepting an Invite, signing in - do **not** go through `mutate` and record no Activity Event. `activity_events.actor_id` is a foreign key to `user.id`, so there is no honest actor to name, and a credential is not a change to the Project. The PM's `createInvite` does go through `mutate`, with a hand-built `messaging_invite` field change: the real diff of that row would write the token hash into `activity_events`.
- Re-issuing an Invite invalidates the previous link and gives a Person who lost their password a way back in, but it does **not** end a session they already hold: the cookie is verified by signature and expiry alone, and nothing reads a credential version. A PM who must cut off access today deletes the Person. Adding revocation means a column the seam checks on every request, and that is deferred with the rest of session management.
- There is no rate limiting on the Participant login or on invite acceptance, because Vantage has no rate limiter anywhere. A failed sign-in also answers faster when the address is unknown than when the password is wrong, so the identical message is not a complete defence. Both are accepted for this surface and are the first things to revisit if it ever holds more than one Project's Chat Messages.
- Reusing the route means the chrome is chosen in two places, not one: both `(app)/layout.tsx` and `(app)/projects/[projectId]/layout.tsx` return the bare page for a Participant. Adding a layout between them without that branch would put the Assistant dock in front of a Person.
- If Vantage ever does gain real collaboration, this is not the migration path. The replacement is the `project_members` table rejected above, and these columns would be dropped rather than grown.
