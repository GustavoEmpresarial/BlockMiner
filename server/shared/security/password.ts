/** Password hashing (bcrypt) — ported from legacy auth.password-jwt-adjacent auth.service.ts. */
import bcrypt from "bcryptjs";

/**
 * OWASP's current password-storage baseline for bcrypt is a work factor of 12 (10 is the
 * hard floor). New password hashes should use this; existing rows keep working unchanged —
 * bcrypt embeds its own cost in the stored hash, so bcrypt.compare() auto-detects whatever
 * cost each row was hashed at regardless of what BCRYPT_COST is today.
 */
export const BCRYPT_COST = 12;

export function hashPassword(plain: string, rounds = BCRYPT_COST): Promise<string> {
  return bcrypt.hash(plain, rounds);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Pre-computed bcrypt hash for a known dummy value (cost 10) — equalises
 * response times for "user not found" vs "wrong password" (anti-enumeration). */
const DUMMY_BCRYPT_HASH = "$2a$10$vI8aWBnW3fID.ZQ4/zo1G.q1lRps.9cGLcZEiGDMVr5yUP1KUOYTa";

export function compareDummyPassword(plain: string): Promise<boolean> {
  return bcrypt.compare(plain, DUMMY_BCRYPT_HASH);
}
