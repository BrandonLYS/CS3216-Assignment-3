"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { Logo } from "@/shared/ui";

const links = [
  { href: "#how", label: "How it works" },
  { href: "#memory", label: "Memory" },
  { href: "#capabilities", label: "Capabilities" },
];

export function LandingNav({ signedIn }: { signedIn: boolean }) {
  const [lifted, setLifted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-colors duration-200",
        lifted ? "border-b border-hairline bg-canvas/85 backdrop-blur-md" : "border-b border-transparent bg-canvas",
      )}
    >
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <Logo className="size-5" />
          <span className="text-body-sm font-medium tracking-[-0.2px] text-ink">Vantage</span>
        </Link>

        <nav className="hidden flex-1 items-center gap-6 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-body-sm text-ink-subtle transition-colors hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          {signedIn ? (
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center rounded-md bg-primary px-3.5 text-body-sm font-medium text-on-primary transition-colors hover:bg-primary-hover active:bg-primary-focus"
            >
              Open workspace
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex h-10 items-center rounded-md px-3 text-body-sm text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="inline-flex h-10 items-center rounded-md bg-primary px-3.5 text-body-sm font-medium text-on-primary transition-colors hover:bg-primary-hover active:bg-primary-focus"
              >
                Get started
              </Link>
            </>
          )}

          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex size-8 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink md:hidden"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-hairline bg-canvas px-6 py-2 md:hidden">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="flex h-11 items-center text-body-sm text-ink-subtle transition-colors hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
