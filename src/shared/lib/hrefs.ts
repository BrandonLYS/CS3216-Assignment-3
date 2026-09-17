/** Where a linked Evidence chip points: the Evidence page with the record selected and anchored. */
export const evidenceHref = (projectId: string, evidenceId: string) =>
  `/projects/${projectId}/evidence?item=${evidenceId}#evidence-${evidenceId}`;
