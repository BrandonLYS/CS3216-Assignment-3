import Link from "next/link";
import { Logo } from "@/shared/ui";

export function LandingFooter() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-6 py-12 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Logo className="size-4" />
          <span className="text-caption text-ink-subtle">PrismPM - project management with a memory</span>
        </div>
        <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-5 text-caption text-ink-subtle">
          <a href="#how" className="transition-colors hover:text-ink">
            How it works
          </a>
          <a href="#capabilities" className="transition-colors hover:text-ink">
            Capabilities
          </a>
          <Link href="/login" className="transition-colors hover:text-ink">
            Sign in
          </Link>
          <a href="#pricing" className="transition-colors hover:text-ink">
            Pricing
          </a>
        </nav>
      </div>
    </footer>
  );
}
