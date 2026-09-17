/** The Decisions page with one Decision's dialog open. */
export const decisionHref = (projectId: string, decisionId: string) =>
  `/projects/${projectId}/decisions?decision=${decisionId}`;

/** Where a linked Evidence chip points: the Evidence page with the record selected and anchored. */
export const evidenceHref = (projectId: string, evidenceId: string) =>
  `/projects/${projectId}/evidence?item=${evidenceId}#evidence-${evidenceId}`;
