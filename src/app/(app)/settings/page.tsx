import { headers } from "next/headers";
import { ctxForCurrentUser } from "@/server/core/action";
import { apiTokensService } from "@/server/modules/api-tokens/service";
import { memoryService } from "@/server/modules/memory/service";
import { PageHeader, SectionTitle } from "@/shared/ui";
import { MemoryEditor } from "@/features/memory/memory-editor";
import { ApiTokens } from "@/features/settings/api-tokens";

export const metadata = { title: "Settings" };

export default async function UserSettingsPage() {
  const ctx = await ctxForCurrentUser();
  const [versions, tokens, h] = await Promise.all([
    memoryService.versions(ctx, null),
    apiTokensService.list(ctx),
    headers(),
  ]);
  const endpoint = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}/api/mcp`;
  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-10 p-6">
          <section className="flex flex-col gap-4">
            <SectionTitle>Assistant</SectionTitle>
            <div>
              <h3 className="text-body-sm font-medium text-ink">Profile</h3>
              <p className="mt-1 text-caption text-ink-subtle">
                How you work: tone, cadence, defaults. The Assistant reads this on every turn, in every Project.
                Reflection revises it after your conversations; every version is kept below.
              </p>
            </div>
            <MemoryEditor
              projectId={null}
              versions={versions}
              placeholder="Always assign new tasks to me. Default to two-week milestones. Keep summaries short."
              hint="Markdown. Roughly 2,000 tokens at most."
            />
          </section>

          <section className="flex flex-col gap-4">
            <SectionTitle>API tokens</SectionTitle>
            <p className="text-caption text-ink-subtle">
              Let an MCP client such as Claude Desktop or Cursor drive your Projects. Each token acts as you; changes
              show in History via Assistant. Destructive tools are not offered over MCP.
            </p>
            <ApiTokens tokens={tokens} endpoint={endpoint} />
          </section>
        </div>
      </div>
    </>
  );
}
