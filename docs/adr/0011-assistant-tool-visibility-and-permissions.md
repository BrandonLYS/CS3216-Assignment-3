---
status: accepted
---

# The User inspects every Assistant tool call and can always-allow write tools per scope

Two properties make the Assistant trustworthy: the User can see what it does, and they control what it may do.
Every tool call already arrives in the chat as a typed UI part carrying its input and, once executed, its output.
The dock now renders each call as a collapsed row that expands to the tool name, its arguments and its result.
Long strings (for example extracted Evidence text) are clipped for display only; the full payload stays in the stored Message, which only the owning User ever reads.

Control follows the same boundary.
Each write tool (`mutates` in the registry) stops at an approval card showing the arguments about to run.
The card offers Deny, Allow once and Always allow.
Always allow writes a `tool_permissions` row keyed `(userId, projectId, toolName)`, so the grant is per Project — and per the dashboard scope (`projectId` null) — never global.
On later turns `toolApprovalFor` answers `approved` for granted tools and the UI marks those calls auto-approved.
Grants are listed and revoked in the dock's permissions popover and in Project Settings; both go through `assistantService`, which re-checks `assertOwnsProject`.

## Considered options

- Approving every tool including reads: rejected; too many clicks for read-only work, and reads expose nothing the User cannot already open.
- Global ("all my Projects") grants: rejected; a User may trust the Assistant in a scratch Project but not in a live one.
- Encoding the grant in the signed approval response: rejected; the signature proves the User answered one call, and silently widening it to future calls hides a policy change inside a crypto detail. A stored row is auditable and revocable.
- Tool permissions as Project items with Activity Events: rejected; like Conversations and Messages they are the Assistant's own documents, so they write without `mutate` (ADR 0007).

## Consequences

- `ToolDef` gains `mutates`; `requiresConfirmation` remains only for destructive tools that render a named-target `describe` card and stay excluded from MCP.
- MCP is unchanged: it still exposes everything except `requiresConfirmation` tools, and saved grants never apply there.
- Denied calls and `describe` failures still resolve to a typed approval status instead of failing the turn.
