import { Crosshair, FileText, GitBranch } from "lucide-react";
import Link from "next/link";
import type { GraphEdgeKind, GraphNodeRef } from "@/server/modules/graph/neighbourhood";
import type { DescribedEdge, DescribedNode, GraphNeighbourhood } from "@/server/modules/graph/service";
import { GRAPH_CENTRE_TYPES, labelFor, type GraphCentreType } from "@/shared/domain";
import { cn } from "@/shared/lib/cn";
import { graphHref } from "@/shared/lib/hrefs";
import { Panel, SectionTitle } from "@/shared/ui";
import { ASSUMPTION_ICON, AssumptionChip } from "@/entities/decision/assumption-chip";
import { CONSEQUENCE_ICON } from "@/entities/decision/consequence-icon";
import { DecisionStatusBadge } from "@/entities/decision/decision-status-badge";

const EDGE_LABEL: Record<GraphEdgeKind, string> = {
  supports: "supports",
  leads_to: "leads to",
  superseded_by: "superseded by",
  watches: "watches",
  depends_on: "depends on",
};

/** Why the two derived relations carry no Source of their own. */
const NO_SOURCE_REASON: Partial<Record<GraphEdgeKind, string>> = {
  watches: "watched by the assumption",
  depends_on: "project dependency",
};

const key = (n: GraphNodeRef) => `${n.type}:${n.id}`;
const isCentreType = (t: GraphNodeRef["type"]): t is GraphCentreType =>
  (GRAPH_CENTRE_TYPES as readonly string[]).includes(t);

/**
 * Node-centred graph page body (issue #41): causes on the left, the selected node in the
 * middle, consequences on the right, each side bounded at three steps. Server component;
 * re-centring is plain navigation through `graphHref`.
 */
export function GraphView({ graph, projectId }: { graph: GraphNeighbourhood; projectId: string }) {
  const nodes = new Map<string, DescribedNode>();
  for (const n of [graph.centre, ...graph.causes, ...graph.consequences]) nodes.set(key(n), n);
  const label = (ref: GraphNodeRef) => {
    const n = nodes.get(key(ref));
    return n ? (n.code ? `${n.code} ${n.label}` : n.label) : "(removed)";
  };
  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(16rem,1.2fr)_1fr]">
        <Column
          title="Causes"
          empty="Nothing recorded leads here"
          testId="graph-causes"
          nodes={graph.causes}
          edgesFor={(n) => graph.causeEdges.filter((e) => key(e.from) === key(n))}
          direction="cause"
          projectId={projectId}
          label={label}
        />
        <section data-testid="graph-centre" className="flex flex-col gap-2">
          <SectionTitle>Selected</SectionTitle>
          <NodeCard node={graph.centre} projectId={projectId} centre />
          {graph.brokenReachesCentre && (
            <p className="text-caption text-tag-red" data-testid="graph-broken-note">
              A broken assumption reaches this node along the highlighted path.
            </p>
          )}
        </section>
        <Column
          title="Consequences"
          empty="Nothing recorded follows"
          testId="graph-consequences"
          nodes={graph.consequences}
          edgesFor={(n) => graph.consequenceEdges.filter((e) => key(e.to) === key(n))}
          direction="consequence"
          projectId={projectId}
          label={label}
        />
      </div>
    </div>
  );
}

function Column({
  title,
  empty,
  testId,
  nodes,
  edgesFor,
  direction,
  projectId,
  label,
}: {
  title: string;
  empty: string;
  testId: string;
  nodes: DescribedNode[];
  edgesFor: (n: DescribedNode) => DescribedEdge[];
  direction: "cause" | "consequence";
  projectId: string;
  label: (ref: GraphNodeRef) => string;
}) {
  return (
    <section data-testid={testId} className="flex min-w-0 flex-col gap-2">
      <SectionTitle>{title}</SectionTitle>
      {nodes.length === 0 ? (
        <p className="py-3 text-caption text-ink-tertiary">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {nodes.map((n) => (
            <li key={key(n)}>
              <NodeCard node={n} projectId={projectId}>
                <ul className="mt-2 flex flex-col gap-1.5 border-t border-hairline pt-2">
                  {edgesFor(n).map((e) => (
                    <EdgeLine
                      key={e.key}
                      edge={e}
                      // A cause points at its neighbour towards the centre; a consequence is pointed at.
                      neighbour={label(direction === "cause" ? e.to : e.from)}
                      direction={direction}
                    />
                  ))}
                </ul>
              </NodeCard>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NodeCard({
  node,
  projectId,
  centre = false,
  children,
}: {
  node: DescribedNode;
  projectId: string;
  centre?: boolean;
  children?: React.ReactNode;
}) {
  const Icon = node.type === "decision" ? GitBranch : node.type === "assumption" ? null : CONSEQUENCE_ICON[node.type];
  const AIcon = node.assumption ? ASSUMPTION_ICON[node.assumption.subtype] : null;
  return (
    <Panel
      data-testid="graph-node"
      data-node={key(node)}
      data-highlighted={node.onBrokenPath ? "true" : undefined}
      className={cn(
        "px-3 py-2.5",
        node.onBrokenPath && "border-l-2 border-l-tag-red",
        centre && "ring-1 ring-primary/40",
      )}
    >
      <div className="flex items-start gap-2">
        {Icon && <Icon className="mt-0.5 size-3.5 shrink-0 text-ink-tertiary" />}
        {AIcon && <AIcon className="mt-0.5 size-3.5 shrink-0 text-ink-tertiary" />}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-body-sm text-ink">
            {node.code && <span className="font-mono text-caption text-ink-tertiary">{node.code}</span>}
            <span className={cn("break-words", centre && "font-medium")}>{node.label}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-caption">
            {node.decision && <DecisionStatusBadge status={node.decision.status} />}
            {node.assumption && (
              <AssumptionChip
                assumption={{
                  statement: labelFor(node.assumption.subtype),
                  subtype: node.assumption.subtype,
                  state: node.assumption.state,
                }}
              />
            )}
            {node.assumption?.targetLabel && (
              <span className="text-ink-subtle">watches {node.assumption.targetLabel}</span>
            )}
            {node.depth > 1 && <span className="text-ink-tertiary">{node.depth} steps away</span>}
            <span className="ml-auto flex items-center gap-2">
              <Link href={node.href} className="text-primary hover:underline">
                Open
              </Link>
              {!centre && isCentreType(node.type) && (
                <Link
                  href={graphHref(projectId, node.type, node.id)}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <Crosshair className="size-3" /> Centre here
                </Link>
              )}
            </span>
          </div>
          {node.assumption?.brokenReason && node.assumption.state === "broken" && (
            <p className="mt-1 text-caption text-ink-subtle">{node.assumption.brokenReason}</p>
          )}
        </div>
      </div>
      {children}
    </Panel>
  );
}

function EdgeLine({
  edge,
  neighbour,
  direction,
}: {
  edge: DescribedEdge;
  neighbour: string;
  direction: "cause" | "consequence";
}) {
  const relation =
    direction === "cause" ? `${EDGE_LABEL[edge.kind]} ${neighbour}` : `${neighbour} ${EDGE_LABEL[edge.kind]} this`;
  return (
    <li
      data-testid="graph-edge"
      data-highlighted={edge.highlighted ? "true" : undefined}
      className={cn("text-caption", edge.highlighted ? "text-tag-red" : "text-ink-subtle")}
    >
      <p>{relation}</p>
      {edge.sources.length ? (
        <ul className="mt-0.5 flex flex-wrap gap-1">
          {edge.sources.map((s) => (
            <li key={s.id}>
              <Link
                href={s.href}
                title={s.excerpt}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-hairline px-2 py-0.5 text-ink-subtle hover:underline"
              >
                <FileText className="size-3 shrink-0" />
                <span className="truncate">{s.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-tertiary">
          No source recorded{NO_SOURCE_REASON[edge.kind] ? ` (${NO_SOURCE_REASON[edge.kind]})` : ""}
        </p>
      )}
    </li>
  );
}
