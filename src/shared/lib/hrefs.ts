import type { GraphCentreType } from "@/shared/domain";

/** The Decisions page with one Decision's dialog open. */
export const decisionHref = (projectId: string, decisionId: string) =>
  `/projects/${projectId}/decisions?decision=${decisionId}`;

/** Where a linked Evidence chip points: the Evidence page with the record selected and anchored. */
export const evidenceHref = (projectId: string, evidenceId: string) =>
  `/projects/${projectId}/evidence?item=${evidenceId}#evidence-${evidenceId}`;

export const taskHref = (projectId: string, taskId: string) => `/projects/${projectId}/tasks?task=${taskId}`;

export const milestoneHref = (projectId: string, milestoneId: string) =>
  `/projects/${projectId}/timeline?milestone=${milestoneId}`;

export const riskHref = (projectId: string, riskId: string) => `/projects/${projectId}/risks?risk=${riskId}`;

/** The node-centred graph page (issue #41) centred on one Decision, Assumption, Milestone or Risk. */
export const graphHref = (projectId: string, type: GraphCentreType, id: string) =>
  `/projects/${projectId}/graph?node=${type}:${id}`;
