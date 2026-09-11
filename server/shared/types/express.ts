// RECOVERED: this ambient-types file was missing from git history (never committed,
// and has no compiled .js counterpart since it's type-only) while the rest of its
// module tree kept running off stale compiled dist/ via Docker build cache.
// Reconstructed on 2026-09-11 from how `AuthSessionUser` / `req.user` are consumed
// across server/shared/security/authUser.ts, server/shared/errors/httpStatusError.ts
// and server/core/http/middleware/auth.ts. TODO: confirm this matches the original
// shape exactly (e.g. whether any User fields were omitted for the session payload).
import type { User } from "@prisma/client";

/** The authenticated user attached to `req.user` by the auth middleware. */
export type AuthSessionUser = User;

/** The authenticated admin attached to `req.admin` by admin.auth.middleware.ts. */
export type AdminSessionUser = {
  role: string;
  adminId?: number;
  sessionId?: string;
  email?: string;
  name?: string;
  permissions?: string[];
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthSessionUser | null;
      admin?: AdminSessionUser | null;
    }
  }
}

export {};
