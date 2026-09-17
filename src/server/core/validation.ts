import { z } from "zod";

/** Form fields arrive as strings; empty means "clear". */
export const optionalText = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().trim().nullable().optional(),
);

export const requiredText = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);

/** ISO date (YYYY-MM-DD) or null. */
export const optionalDate = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
    .nullable()
    .optional(),
);

export const requiredDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required");

export const optionalId = optionalText;

export const optionalNumber = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().finite().nullable().optional(),
);

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid colour");

/** Turn FormData into a plain object; repeated keys become arrays. */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k in out) out[k] = ([] as unknown[]).concat(out[k], v);
    else out[k] = v;
  }
  return out;
}

/** Hidden inputs can only carry strings; parse JSON when a structured value arrives that way. */
export const parseJsonIfString = (v: unknown) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};
