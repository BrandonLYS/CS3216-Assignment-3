"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { dismissAlertAction } from "@/server/modules/decisions/actions";
import { Button } from "@/shared/ui";

export function DismissAlertButton({ assumptionId }: { assumptionId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-caption text-tag-red">{error}</span>}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        loading={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const res = await dismissAlertAction({ id: assumptionId });
          setPending(false);
          if (!res.ok) setError(res.error);
          else router.refresh();
        }}
      >
        Dismiss
      </Button>
    </span>
  );
}
