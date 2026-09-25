import { createHash, randomBytes } from "node:crypto";

/** sha256 hex digest of a bearer token; only this is ever stored, never the token itself. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** A random, URL-safe token: 24 bytes of entropy, matching a personal access token's. */
export const randomToken = () => randomBytes(24).toString("base64url");
