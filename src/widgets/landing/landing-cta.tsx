import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Reveal } from "./reveal";

export function LandingCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="mx-auto max-w-[1280px] px-6 pt-8 pb-24">
      <Reveal>
        <div data-reveal className="rounded-lg border border-hairline bg-surface-1 px-6 py-12 text-center sm:px-12">
          <h2 className="mx-auto max-w-xl text-headline text-ink">Start recording the why, not just the what</h2>
          <p className="mx-auto mt-4 max-w-lg text-body text-ink-subtle">
            One project manager, one workspace, and a history you can hand to anyone who asks how you got here.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={signedIn ? "/dashboard" : "/signup"}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-body-sm font-medium text-on-primary transition-colors hover:bg-primary-hover active:bg-primary-focus"
            >
              {signedIn ? "Open your workspace" : "Create an account"}
              <ArrowRight className="size-4" />
            </Link>
            {!signedIn && (
              <Link
                href="/login"
                className="inline-flex h-10 items-center rounded-md border border-hairline bg-canvas px-4 text-body-sm font-medium text-ink transition-colors hover:border-hairline-strong hover:bg-surface-2"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
