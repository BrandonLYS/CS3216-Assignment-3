"use client";

import { Copy, KeyRound } from "lucide-react";
import * as React from "react";
import { createApiTokenAction, revokeApiTokenAction } from "@/server/modules/api-tokens/actions";
import type { apiTokensService } from "@/server/modules/api-tokens/service";
import { fmtDateTime, relative } from "@/shared/lib/dates";
import { ActionForm, Badge, Button, Panel, TextField } from "@/shared/ui";

type TokenRow = Awaited<ReturnType<typeof apiTokensService.list>>[number];

/** Personal access tokens for the MCP endpoint. The raw token is shown once, right after creation. */
export function ApiTokens({ tokens, endpoint }: { tokens: TokenRow[]; endpoint: string }) {
  const [fresh, setFresh] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  return (
    <div className="flex flex-col gap-4">
      <Panel className="p-5">
        <ActionForm
          action={createApiTokenAction}
          submitLabel="Generate token"
          onSuccess={(data) => setFresh((data as { token: string }).token)}
        >
          <TextField name="label" label="Label" required placeholder="Claude Desktop on my laptop" />
        </ActionForm>
        {fresh && (
          <div role="status" className="mt-4 rounded-md border border-hairline-strong bg-surface-2 p-3">
            <p className="text-caption text-ink-subtle">Copy this token now. It is not shown again.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 truncate font-mono text-mono text-ink">{fresh}</code>
              <Button
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(fresh);
                  setCopied(true);
                }}
              >
                <Copy className="size-3" /> {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="mt-3 text-caption text-ink-subtle">
              MCP endpoint: <code className="font-mono text-mono text-ink">{endpoint}</code>, header{" "}
              <code className="font-mono text-mono text-ink">Authorization: Bearer &lt;token&gt;</code>.
            </p>
          </div>
        )}
      </Panel>

      {tokens.length > 0 && (
        <ul className="flex flex-col gap-2">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-3 panel px-4 py-2.5 text-caption">
              <KeyRound className="size-3.5 text-ink-tertiary" />
              <span className="font-medium text-ink">{t.label}</span>
              <code className="font-mono text-mono text-ink-subtle">{t.prefix}…</code>
              <span className="text-ink-tertiary" title={fmtDateTime(t.createdAt)}>
                created {relative(t.createdAt)}
              </span>
              {t.lastUsedAt && <span className="text-ink-tertiary">· used {relative(t.lastUsedAt)}</span>}
              <span className="ml-auto">
                {t.revokedAt ? (
                  <Badge>Revoked</Badge>
                ) : (
                  <ActionForm action={revokeApiTokenAction} hidden={{ id: t.id }} submitLabel="Revoke" danger>
                    <span />
                  </ActionForm>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
