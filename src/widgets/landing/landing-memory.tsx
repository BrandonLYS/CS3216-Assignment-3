import { DecisionTrace } from "./decision-trace";
import { Reveal } from "./reveal";

const kinds = [
  { name: "date", note: "a Milestone or Task date moves" },
  { name: "person", note: "a Person leaves the Project" },
  { name: "dependency", note: "a Dependency is removed" },
  { name: "external-rule", note: "a condition outside the Project, in words" },
];

export function LandingMemory() {
  return (
    <section id="memory" className="mx-auto max-w-[1280px] px-6 py-32">
      <Reveal className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:items-center lg:gap-20">
        <div>
          <span data-reveal className="text-eyebrow font-medium tracking-[0.4px] text-ink-tertiary uppercase">
            Decision memory
          </span>
          <h2 data-reveal className="mt-5 text-display-md text-balance text-ink">
            An assumption that breaks should tell you
          </h2>
          <p data-reveal className="mt-6 max-w-lg text-body-lg text-pretty text-ink-subtle">
            A Decision rests on Assumptions, and each Assumption is typed by what can invalidate it. When the Project
            moves the date, drops the Dependency or loses the Person, the Assumption goes from holding to broken - and
            the Decision it carried is worth revisiting.
          </p>

          <dl data-reveal className="mt-10 border-t border-hairline">
            {kinds.map((kind) => (
              <div
                key={kind.name}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-hairline py-4"
              >
                <dt className="font-mono text-mono text-ink">{kind.name}</dt>
                <dd className="text-body-sm text-ink-subtle">{kind.note}</dd>
              </div>
            ))}
          </dl>

          <p data-reveal className="mt-8 max-w-lg text-body-sm text-ink-tertiary">
            Nothing the Assistant extracts enters the graph on its own. A Proposal waits, with its Sources attached,
            until you accept it.
          </p>
        </div>

        <div data-reveal className="flex items-center justify-center">
          <DecisionTrace />
        </div>
      </Reveal>
    </section>
  );
}
