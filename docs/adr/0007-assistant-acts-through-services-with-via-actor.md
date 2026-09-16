---
status: accepted
---

# The Assistant is a second caller of the service layer, not a separate write path

The Assistant's tools are a registry of `name / zod input / handler(ctx, input)` entries that call the existing `src/server/modules/<feature>/service.ts` functions. No tool touches a repository or the database directly, so `assertOwnsProject`, validation, Activity Events and domain events all apply to Assistant writes for free (ADR 0005). The same registry is exposed to external clients over MCP as a thin adapter; MCP is an adapter over the registry, never the registry itself.

To tell Assistant writes apart in History, `Ctx` gains an optional `via: "assistant" | "reflection"` and the Recorder stamps it on every Activity Event. The alternative, a separate agent User, was rejected because ownership checks are per User and the Assistant must act as the User, not beside them.

Reflection runs in the chat route's `after()` hook, not a queue. Vercel functions have no long-lived process, so the in-process `eventBus` cannot host it; a real queue (QStash, Inngest) is more infrastructure than a course project needs. `after()` is bounded by the function timeout, which is enough for one model call. If Reflection grows past that, the seam is the single `reflect(conversationId)` function and it can be re-pointed at a queue.

## Considered options

- MCP server first, Assistant as an MCP client: rejected; adds a transport and token plumbing between two halves of the same app for no benefit.
- Separate "agent" User account: rejected; breaks `assertOwnsProject` and would make the Assistant an owner of nothing.
- Reflection on every Message: rejected; doubles model spend and races on the memory row. Throttled by time and message count instead.

## Consequences

- Profile and Working Memory are versioned rows in Postgres, not files; every write (User or Reflection) appends a version with its author.
- Conversations, Messages, Profile and Working Memory versions are the Assistant's own documents, not Project items: they carry no Activity Event and no domain event, so `assistantService` and `memoryService` write them without `mutate`.
- Destructive tools (deletes, Project-level updates) stop at an AI SDK approval request; the client renders a confirm card and answers it, and only then does the tool execute. They are excluded from the MCP adapter, which has no UI to confirm.
- Reflection is `reflect(conversationId)` in `src/server/modules/reflection/service.ts`, scheduled with `after()` from the chat route once the thread is saved. It runs under `via: "reflection"`, is throttled by time and Message count, must keep every User-written line verbatim, and never surfaces a failure to the User.
