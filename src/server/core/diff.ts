export interface FieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  /** Id of the Activity Event row for this change; set by the Recorder after flush. */
  activityEventId?: string;
}

const normalise = (v: unknown) => (v instanceof Date ? v.toISOString() : (v ?? null));

/** Shallow diff of `patch` against `before`, restricted to keys present in `patch`. */
export function diffFields<T extends object>(before: T, patch: Partial<T>): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const oldValue = normalise(before[key]);
    const newValue = normalise(patch[key]);
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push({ field: String(key), oldValue, newValue });
    }
  }
  return changes;
}

/** Drop keys whose value is `undefined` so partial patches don't overwrite with NULL. */
export function compactPatch<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;
}
