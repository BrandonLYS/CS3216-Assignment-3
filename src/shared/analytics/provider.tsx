"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useSession } from "@/shared/lib/auth-client";
import { capturePageview, syncAnalyticsIdentity } from "./browser";

function AnalyticsSession() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, isPending, error } = useSession();

  useEffect(() => {
    syncAnalyticsIdentity(isPending || error ? undefined : (session?.user.id ?? null));
    if (!pathname || isPending || error) return;
    const query = searchParams.toString();
    capturePageview(query ? `${pathname}?${query}` : pathname);
  }, [pathname, searchParams, session?.user.id, isPending, error]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <AnalyticsSession />
      </Suspense>
    </>
  );
}
