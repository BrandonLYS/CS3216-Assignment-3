import type { Ctx } from "@/server/core/context";
import { NotFoundError } from "@/server/core/errors";
import { activityRepo } from "@/server/modules/activity/service";
import { commentsRepo } from "@/server/modules/comments/repository";
import { sourceHref } from "@/server/modules/decisions/answers";
import { assumptionsRepo, decisionsRepo, edgesRepo, sourcesRepo } from "@/server/modules/decisions/repository";
import type { AssumptionRow, DecisionSourceRow } from "@/server/modules/decisions/schema";
import { dependenciesRepo } from "@/server/modules/dependencies/repository";
import { milestonesRepo } from "@/server/modules/milestones/repository";
import { peopleRepo } from "@/server/modules/people/repository";
import { assertOwnsProject } from "@/server/modules/projects/service";
import { risksRepo } from "@/server/modules/risks/repository";
import { tasksRepo } from "@/server/modules/tasks/repository";
import type { DecisionStatus } from "@/shared/domain";
import { decisionHref, milestoneHref, riskHref, taskHref } from "@/shared/lib/hrefs";
import { neighbourhood, type GraphEdge, type GraphNode, type GraphNodeRef } from "./neighbourhood";
import type { GraphCentre } from "./validation";

export interface DescribedNode extends GraphNodeRef {
  label: string;
  /** `D-n`, `KEY-n`, `R-n`; Assumptions and Milestones have none. */
  code: string | null;
  decision: { status: DecisionStatus } | null;
  href: string;
  assumption: (Pick<AssumptionRow, "subtype" | "state" | "brokenReason"> & { targetLabel: string | null }) | null;
  depth: number;
  onBrokenPath: boolean;
}

export interface DescribedSource {
  id: string;
  kind: DecisionSourceRow["kind"];
  label: string;
  excerpt: string;
  href: string;
}

export interface DescribedEdge extends GraphEdge {
  sources: DescribedSource[];
}

export interface GraphNeighbourhood {
  centre: DescribedNode;
  causes: DescribedNode[];
  consequences: DescribedNode[];
  causeEdges: DescribedEdge[];
  consequenceEdges: DescribedEdge[];
  brokenReachesCentre: boolean;
}

/** Read model for the node-centred graph page (issue #41). Computed on read over the current graph. */
export const graphService = {
  neighbourhood: async (ctx: Ctx, { projectId, centre }: { projectId: string; centre: GraphCentre }) => {
    const project = await assertOwnsProject(ctx.db, ctx.userId, projectId);
    const [edges, assumptions, decisions, tasks, milestones, risks, dependencies, people] = await Promise.all([
      edgesRepo.listByProject(ctx.db, projectId),
      assumptionsRepo.listByProject(ctx.db, projectId),
      decisionsRepo.listByProject(ctx.db, projectId),
      tasksRepo.listByProject(ctx.db, projectId),
      milestonesRepo.listByProject(ctx.db, projectId),
      risksRepo.listByProject(ctx.db, projectId),
      dependenciesRepo.listByProject(ctx.db, projectId),
      peopleRepo.listByProject(ctx.db, projectId),
    ]);

    const describeRef = (n: GraphNodeRef): Omit<DescribedNode, "depth" | "onBrokenPath"> | null => {
      if (n.type === "decision") {
        const d = decisions.find((x) => x.decision.id === n.id)?.decision;
        return !d
          ? null
          : {
              ...n,
              label: d.title,
              code: `D-${d.number}`,
              decision: { status: d.status },
              href: decisionHref(projectId, d.id),
              assumption: null,
            };
      }
      if (n.type === "assumption") {
        const a = assumptions.find((x) => x.id === n.id);
        if (!a) return null;
        const supported = edges.find((e) => e.kind === "supports" && e.fromId === a.id)?.toId;
        const person = a.targetType === "person" ? people.find((p) => p.id === a.targetId) : undefined;
        return {
          ...n,
          label: a.statement,
          code: null,
          decision: null,
          href: supported ? decisionHref(projectId, supported) : `/projects/${projectId}/decisions`,
          assumption: {
            subtype: a.subtype,
            state: a.state,
            brokenReason: a.brokenReason,
            targetLabel: person?.name ?? null,
          },
        };
      }
      if (n.type === "task") {
        const t = tasks.find((x) => x.task.id === n.id)?.task;
        return !t
          ? null
          : {
              ...n,
              label: t.title,
              code: `${project.key}-${t.number}`,
              decision: null,
              href: taskHref(projectId, t.id),
              assumption: null,
            };
      }
      if (n.type === "milestone") {
        const m = milestones.find((x) => x.milestone.id === n.id)?.milestone;
        return !m
          ? null
          : { ...n, label: m.name, code: null, decision: null, href: milestoneHref(projectId, m.id), assumption: null };
      }
      const r = risks.find((x) => x.risk.id === n.id)?.risk;
      return !r
        ? null
        : {
            ...n,
            label: r.title,
            code: `R-${r.number}`,
            decision: null,
            href: riskHref(projectId, r.id),
            assumption: null,
          };
    };

    const centreDescribed = describeRef(centre);
    if (!centreDescribed) throw new NotFoundError("Node");

    const known = [
      ...decisions.map((d) => `decision:${d.decision.id}`),
      ...assumptions.map((a) => `assumption:${a.id}`),
      ...tasks.map((t) => `task:${t.task.id}`),
      ...milestones.map((m) => `milestone:${m.milestone.id}`),
      ...risks.map((r) => `risk:${r.risk.id}`),
    ];
    const graph = neighbourhood({ centre, edges, assumptions, dependencies, known });

    // Sources on the stored edges; a deleted Comment falls back to the Decision the Sources were copied from:
    // the Decision a `supports` edge points at, the newer Decision of a `superseded_by`, the Decision a `leads_to` leaves.
    const edgeIds = [...graph.causeEdges, ...graph.consequenceEdges].flatMap((e) => (e.edgeId ? [e.edgeId] : []));
    const sources = await sourcesRepo.listForEdges(ctx.db, edgeIds);
    const [comments, events] = await Promise.all([
      commentsRepo.findByIds(
        ctx.db,
        sources.filter((s) => s.kind === "comment").map((s) => s.entityId),
      ),
      activityRepo.findByIds(
        ctx.db,
        sources.filter((s) => s.kind === "activity_event").map((s) => s.entityId),
      ),
    ]);
    const lookups = {
      comments: new Map(comments.map((c) => [c.id, c])),
      events: new Map(events.map((e) => [e.id, e])),
    };
    const describeEdge = (e: GraphEdge): DescribedEdge => {
      const decisionId = e.kind === "leads_to" ? e.from.id : e.to.id;
      return {
        ...e,
        sources: sources
          .filter((s) => s.edgeId === e.edgeId)
          .map((s) => ({
            id: s.id,
            kind: s.kind,
            label: s.label,
            excerpt: s.excerpt,
            href: sourceHref(projectId, decisionId, s, lookups),
          })),
      };
    };
    const describeNode = (n: GraphNode): DescribedNode | null => {
      const d = describeRef(n);
      return d ? { ...d, depth: n.depth, onBrokenPath: n.onBrokenPath } : null;
    };
    const present = (nodes: GraphNode[]) => nodes.map(describeNode).filter((x): x is DescribedNode => Boolean(x));

    const result: GraphNeighbourhood = {
      centre: { ...centreDescribed, depth: 0, onBrokenPath: graph.brokenReachesCentre },
      causes: present(graph.causes),
      consequences: present(graph.consequences),
      causeEdges: graph.causeEdges.map(describeEdge),
      consequenceEdges: graph.consequenceEdges.map(describeEdge),
      brokenReachesCentre: graph.brokenReachesCentre,
    };
    return result;
  },
};
