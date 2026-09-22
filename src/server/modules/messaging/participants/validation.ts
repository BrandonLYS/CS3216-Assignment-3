import { z } from "zod";

/**
 * A Person's password is weaker than a User's by design (ADR 0009): no verification, no reset
 * mail. Length is the only rule, and 12 is what the demo account already uses.
 */
export const PARTICIPANT_PASSWORD_MIN = 12;

const password = z.string().min(PARTICIPANT_PASSWORD_MIN, `Use at least ${PARTICIPANT_PASSWORD_MIN} characters`);

export const createInviteSchema = z.object({
  projectId: z.string(),
  personId: z.string(),
});

export const acceptInviteSchema = z
  .object({
    token: z.string().min(1),
    password,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

export const participantLoginSchema = z.object({
  projectId: z.string(),
  email: z.string().trim().min(1, "Email is required"),
  // Not `password` above: an existing credential shorter than the current minimum must still be
  // able to sign in, and telling a stranger the rule at the login form buys nothing.
  password: z.string().min(1, "Password is required"),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
export type ParticipantLoginInput = z.infer<typeof participantLoginSchema>;
