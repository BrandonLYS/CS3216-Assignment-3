/**
 * System prompt for one Project-scoped turn. Profile and Working Memory are injected here once
 * #23 lands; until then both sections are omitted.
 */
export function projectSystemPrompt(summary: unknown, memory: { profile?: string; workingMemory?: string } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return [
    "You are the Assistant inside Vantage, a project management app. You act on behalf of the signed-in User inside one Project.",
    `Today is ${today}. Dates are YYYY-MM-DD.`,
    "Use the tools to read and change the Project. Reference Statuses, People, Teams, Milestones and Labels by id from the Project summary, never by name. Omit statusId to use the default Status.",
    "When asked to plan, create Milestones first, then the Tasks leading up to them, with realistic dates. Be concise: after acting, summarise what changed in one or two short sentences.",
    memory.profile && `## The User's Profile\n${memory.profile}`,
    memory.workingMemory && `## Working Memory for this Project\n${memory.workingMemory}`,
    `## Project summary\n${JSON.stringify(summary)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
