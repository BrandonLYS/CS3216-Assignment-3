"use client";

import { useSearchParams } from "next/navigation";
import * as React from "react";
import { listEntityHistoryAction } from "@/server/modules/activity/actions";
import type { HistoryEntry } from "@/server/modules/activity/enrich";
import type { HistoryEntityType } from "@/shared/domain";
import { Tab, TabList, TabPanel, Tabs, useTabsId } from "@/shared/ui";
import { EntityHistory } from "@/entities/activity/entity-history";

type TabId = "details" | "history";

/**
 * Details / History tab bar for the item dialogs. Wraps the existing edit <ActionForm>
 * (passed as children); `history={null}` (create mode) renders the children with no tab bar.
 *
 * History is fetched on every activation of the tab — not in an effect — so opening the
 * dialog on Details costs nothing and inline writes that keep the dialog open (Comments,
 * Dependencies, Evidence links) are picked up on the next switch.
 */
export function ItemDialogTabs({
  history,
  children,
}: {
  history: { projectId: string; entityType: HistoryEntityType; entityId: string } | null;
  children: React.ReactNode;
}) {
  // `?tab=history` (a cited change, issue #40) opens straight on History.
  const initialTab: TabId = useSearchParams().get("tab") === "history" && history ? "history" : "details";
  const [tab, setTab] = React.useState<TabId>(initialTab);
  const [entries, setEntries] = React.useState<HistoryEntry[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Guards for the un-effect fetch: drop responses from a superseded request (rapid tab
  // toggles) and never setState after the dialog has unmounted mid-flight.
  const requestId = React.useRef(0);
  const mounted = React.useRef(false);
  async function load() {
    if (!history) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    const res = await listEntityHistoryAction(history);
    if (!mounted.current || id !== requestId.current) return;
    setLoading(false);
    if (!res.ok) return setError(res.error);
    setEntries(res.data);
  }

  React.useEffect(() => {
    mounted.current = true;
    // Deferred so the first render commits before the fetch flips `loading`.
    if (initialTab === "history") void Promise.resolve().then(load);
    return () => {
      mounted.current = false;
    };
    // Mount-only: the initial tab is read once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!history) return <>{children}</>;

  const change = (v: string) => {
    setTab(v as TabId);
    if (v === "history") void load();
  };

  return (
    <Tabs value={tab} onValueChange={change}>
      <TabList aria-label="Item sections">
        <Tab value="details">Details</Tab>
        <Tab value="history">History</Tab>
      </TabList>
      <DetailsPanel active={tab === "details"}>{children}</DetailsPanel>
      <TabPanel value="history">
        <EntityHistory entries={entries} entityType={history.entityType} loading={loading} error={error} />
      </TabPanel>
    </Tabs>
  );
}

/**
 * Details stays mounted (hidden) so unsaved edits and LabelPicker state survive a tab switch;
 * a `<TabPanel>` would unmount. Wired like one: `id` matches the tab's `aria-controls`.
 */
function DetailsPanel({ active, children }: { active: boolean; children: React.ReactNode }) {
  const id = useTabsId();
  return (
    <div
      role="tabpanel"
      id={`${id}-panel-details`}
      aria-labelledby={`${id}-tab-details`}
      tabIndex={active ? 0 : undefined}
      hidden={!active}
      aria-hidden={active ? undefined : true}
      className={active ? "pt-4" : "hidden"}
    >
      {children}
    </div>
  );
}
