import type { Metadata } from "next";
import { getSession } from "@/server/auth/session";
import {
  LandingCapabilities,
  LandingCta,
  LandingFooter,
  LandingHero,
  LandingMemory,
  LandingNav,
  ScrollVideo,
} from "@/widgets/landing";

export const metadata: Metadata = {
  title: "PrismPM - project management with a memory",
  description:
    "PrismPM records the tasks, milestones and risks you would expect, and underneath them the decisions, the assumptions they rest on and the evidence they came from.",
};

/**
 * The landing page is the one screen a visitor sees before the database matters, so a
 * session lookup that fails degrades to signed-out rather than failing the whole page.
 */
async function isSignedIn() {
  try {
    return (await getSession()) !== null;
  } catch {
    return false;
  }
}

export default async function LandingPage() {
  const signedIn = await isSignedIn();

  return (
    <div data-landing className="flex flex-1 flex-col bg-canvas">
      <LandingNav signedIn={signedIn} />
      <main className="flex-1">
        <LandingHero signedIn={signedIn} />
        <ScrollVideo />
        <LandingMemory />
        <LandingCapabilities />
        <LandingCta signedIn={signedIn} />
      </main>
      <LandingFooter />
    </div>
  );
}
