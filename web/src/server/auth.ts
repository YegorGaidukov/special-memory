import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const AUTH_COOKIE = "cmc_curator";

/**
 * Constant-time password compare. Minimal auth per the spec: one shared curator
 * password (env CURATOR_PASSWORD) gates all mutating routes — no per-user
 * accounts. Returns false if no password is configured (locked by default).
 */
export function checkPassword(supplied: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Route guard: true when the request carries a valid curator cookie. */
export async function isAuthed(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  return checkPassword(token ?? "", process.env.CURATOR_PASSWORD);
}
