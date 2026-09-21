import { CalendarRange, FileText, GitBranch, History, MessageSquare, TriangleAlert } from "lucide-react";
import { Reveal } from "./reveal";

const capabilities = [
  {
    icon: History,
    title: "Field-level history",
    body: "Every change is an Activity Event: which field, from what, to what, by whom, when. Immutable, and the same whether a person or the Assistant made it.",
  },
  {
    icon: FileText,
    title: "Evidence and passages",
    body: "Upload a plan, minutes or a transcript. Transcripts are stored as ordered Passages so a citation can point at the sentence that mattered.",
  },
  {
    icon: GitBranch,
    title: "Dependencies that surface",
    body: "A directed edge saying one item cannot proceed until another is done - with late dependencies rolled up where you will see them.",
  },
  {
    icon: TriangleAlert,
    title: "A risk register, not a label",
    body: "Risks carry probability, impact and an owner, and sit apart from the blocked status so the two never get confused.",
  },
  {
    icon: CalendarRange,
    title: "Timeline and calendar",
    body: "Tasks with dates and Milestones they roll up to, across one Project or the whole workspace.",
  },
  {
    icon: MessageSquare,
    title: "Assistant, and MCP",
    body: "Converse in the app, or point your own client at the same tools over a Streamable HTTP endpoint with a personal token.",
  },
];

export function LandingCapabilities() {
  return (
    <section id="capabilities" className="mx-auto max-w-[1280px] px-6 py-24">
      <Reveal>
        <span data-reveal className="text-eyebrow font-medium tracking-[0.4px] text-ink-tertiary uppercase">
          Capabilities
        </span>
        <h2 data-reveal className="mt-4 max-w-2xl text-display-md text-ink">
          The base is boring on purpose
        </h2>
        <p data-reveal className="mt-5 max-w-xl text-body-lg text-ink-subtle">
          An intelligence layer is only as good as the record under it. Vantage keeps that record strict enough to
          reason over.
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              data-reveal
              className="rounded-lg border border-hairline bg-surface-1 p-6 transition-colors hover:border-hairline-strong hover:bg-surface-2"
            >
              <Icon className="size-4 text-ink-subtle" />
              <h3 className="mt-4 text-card-title text-ink">{title}</h3>
              <p className="mt-2 text-body-sm text-ink-subtle">{body}</p>
            </article>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
