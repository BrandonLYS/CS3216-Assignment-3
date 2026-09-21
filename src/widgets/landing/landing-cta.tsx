import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Reveal } from "./reveal";

export function LandingCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="border-t border-hairline">
      <Reveal className="mx-auto max-w-[1280px] px-6 py-32 text-center">
        <h2 data-reveal className="mx-auto max-w-2xl text-display-md text-balance text-ink">
          Start recording the why, not just the what
        </h2>
        <p data-reveal className="mx-auto mt-6 max-w-lg text-body-lg text-pretty text-ink-subtle">
          One project manager, one workspace, and a history you can hand to anyone who asks how you got here.
        </p>
        <div data-reveal className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={signedIn ? "/dashboard" : "/signup"}
            className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-body-sm font-medium text-on-primary transition-colors hover:bg-primary-hover active:bg-primary-focus"
          >
            {signedIn ? "Open your workspace" : "Create an account"}
            <ArrowRight className="size-4" />
          </Link>
          {!signedIn && (
            <Link
              href="/login"
              className="inline-flex h-11 items-center rounded-md border border-hairline px-5 text-body-sm font-medium text-ink transition-colors hover:border-hairline-strong hover:bg-surface-1"
            >
              Sign in
            </Link>
          )}
        </div>
      </Reveal>
    </section>
  );
}
