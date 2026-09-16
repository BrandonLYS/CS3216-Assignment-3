import { ctxForCurrentUser } from "@/server/core/action";
import { memoryService } from "@/server/modules/memory/service";
import { PageHeader, SectionTitle } from "@/shared/ui";
import { MemoryEditor } from "@/features/memory/memory-editor";

export const metadata = { title: "Settings" };

export default async function UserSettingsPage() {
  const ctx = await ctxForCurrentUser();
  const versions = await memoryService.versions(ctx, null);
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
        </div>
      </div>
    </>
  );
}
