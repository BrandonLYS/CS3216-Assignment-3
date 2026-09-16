"use client";

import { RotateCcw } from "lucide-react";
import * as React from "react";
import { saveMemoryAction } from "@/server/modules/memory/actions";
import type { MemoryVersionRow } from "@/server/modules/memory/schema";
import { diffLines } from "@/shared/lib/diff";
import { cn } from "@/shared/lib/cn";
import { fmtDateTime, relative } from "@/shared/lib/dates";
import { ActionForm, Badge, Button, Panel, TextareaField } from "@/shared/ui";

const AUTHOR_LABEL = { user: "You", reflection: "Reflection" } as const;

/**
 * Markdown editor plus version list for a Profile (`projectId` null) or a Project's Working
 * Memory. Restore submits an old body as a new version written by the User.
 */
export function MemoryEditor({
  projectId,
  versions,
  placeholder,
  hint,
}: {
  projectId: string | null;
  /** Newest first, as returned by `memoryService.versions`. */
  versions: MemoryVersionRow[];
  placeholder: string;
  hint: string;
}) {
  const current = versions[0] ?? null;
  const [saved, setSaved] = React.useState(false);
  const [restoring, startRestore] = React.useTransition();
  const restore = (v: MemoryVersionRow) =>
    startRestore(async () => {
      const fd = new FormData();
      fd.set("projectId", projectId ?? "");
      fd.set("body", v.body);
      await saveMemoryAction(fd);
    });

  return (
    <div className="flex flex-col gap-4">
      <Panel className="p-5">
        <ActionForm
          key={current?.id ?? "empty"}
          action={saveMemoryAction}
          hidden={{ projectId: projectId ?? "" }}
          submitLabel={saved ? "Saved" : "Save"}
          onSuccess={() => {
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
          }}
        >
          <TextareaField
            name="body"
            label="Markdown"
            hint={hint}
            defaultValue={current?.body ?? ""}
            placeholder={placeholder}
            inputClassName="min-h-40 font-mono text-mono"
          />
        </ActionForm>
      </Panel>

      {versions.length > 0 && (
        <ol className="flex flex-col gap-2">
          {versions.map((v, i) => {
            const previous = versions[i + 1]?.body ?? "";
            return (
              <li key={v.id}>
                <details className="panel">
                  <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-caption text-ink-muted select-none">
                    <Badge>{AUTHOR_LABEL[v.author]}</Badge>
                    <time dateTime={v.createdAt.toISOString()} title={fmtDateTime(v.createdAt)}>
                      {relative(v.createdAt)}
                    </time>
                    {i === 0 && <span className="text-ink-tertiary">current</span>}
                    {i > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto"
                        loading={restoring}
                        onClick={(e) => {
                          e.preventDefault();
                          restore(v);
                        }}
                      >
                        <RotateCcw className="size-3" /> Restore
                      </Button>
                    )}
                  </summary>
                  <pre className="border-t border-hairline px-4 py-3 font-mono text-mono leading-relaxed whitespace-pre-wrap">
                    {diffLines(previous, v.body).map((l, n) => (
                      <span
                        key={n}
                        className={cn(
                          "block",
                          l.kind === "added" && "bg-tag-green/10 text-tag-green",
                          l.kind === "removed" && "bg-tag-red/10 text-tag-red line-through",
                          l.kind === "same" && "text-ink-muted",
                        )}
                      >
                        {l.kind === "added" ? "+ " : l.kind === "removed" ? "- " : "  "}
                        {l.text}
                      </span>
                    ))}
                  </pre>
                </details>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
