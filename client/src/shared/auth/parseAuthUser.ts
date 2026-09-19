/** Session/login user shape the SPA actually keeps. No secrets. */
export type ParsedAuthUser = {
  id: number;
  name: string;
  username: string | null;
  email: string;
  emailVerified?: boolean;
};

export function parseAuthUserPayload(raw: unknown): ParsedAuthUser | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'number') return null;
  if (typeof o.name !== 'string') return null;
  if (typeof o.email !== 'string') return null;
  const un = o.username;
  if (un !== null && typeof un !== 'string') return null;
  const emailVerified = o.emailVerified === true || o.emailVerified === false ? o.emailVerified : undefined;
  return {
    id: o.id,
    name: o.name,
    email: o.email,
    username: un ?? null,
    ...(emailVerified !== undefined ? { emailVerified } : {}),
  };
}
