import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";

export function LandingPricing({ signedIn }: { signedIn: boolean }) {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="border-y border-hairline">
      <div className="mx-auto grid max-w-[1280px] gap-12 px-6 py-24 sm:py-32 lg:grid-cols-2 lg:gap-24">
        <div>
          <p className="text-eyebrow font-medium tracking-[0.4px] text-ink-subtle uppercase">Pricing hypothesis</p>
          <h2 id="pricing-title" className="mt-5 max-w-lg text-display-md text-balance text-ink">
            Start with a real project.
          </h2>
          <p className="mt-6 max-w-lg text-body-lg text-ink-subtle">
            Try a workspace that keeps the plan and the reasoning together. We are exploring what project managers need
            before deciding on paid plans.
          </p>
          <p className="mt-6 max-w-lg text-body-sm text-ink-subtle">
            This is a research preview. Future pricing is still being explored; no paid subscription is offered today.
          </p>
        </div>
        <div className="rounded-lg border border-hairline bg-surface-1 p-6 sm:p-8">
          <p className="text-eyebrow font-medium text-ink-muted">Research preview</p>
          <p className="mt-4 text-display-lg font-semibold text-ink">Free</p>
          <p className="mt-2 text-body-sm text-ink-subtle">During the research preview. No payment card required.</p>
          <ul className="my-8 space-y-4 text-body-sm text-ink-muted">
            {[
              "Tasks, Milestones and Risks in one workspace",
              "Decisions connected to their Assumptions and Sources",
              "Evidence and a field-by-field history",
            ].map((feature) => (
              <li key={feature} className="flex gap-3">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                {feature}
              </li>
            ))}
          </ul>
          <Link
            href={signedIn ? "/dashboard" : "/signup"}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 py-2 text-body-sm font-medium text-on-primary transition-colors hover:bg-primary-hover active:bg-primary-focus"
          >
            {signedIn ? "Open your workspace" : "Try the research preview"}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
