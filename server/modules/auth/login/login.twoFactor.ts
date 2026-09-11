/**
 * Email 2FA on login is optional: explicit env flags + per-user `isTwoFactorEnabled`.
 * Absent env values default to false (no implicit "require for everyone").
 */
export type AuthTwoFactorEnvConfig = {
  emailTwoFactorEnabled: boolean;
  emailTwoFactorRequiredForAllUsers: boolean;
  emailTwoFactorRequiredForAdmins: boolean;
};

const TRUTHY = new Set(["1", "true", "yes", "enabled", "on"]);
const FALSY = new Set(["0", "false", "no", "disabled", "off"]);

export function parseAuthBoolEnv(value: string | undefined, defaultWhenUnset: boolean): boolean {
  if (value === undefined || value === null) return defaultWhenUnset;
  const s = String(value).trim();
  if (s === "") return defaultWhenUnset;
  const lower = s.toLowerCase();
  if (TRUTHY.has(lower)) return true;
  if (FALSY.has(lower)) return false;
  return defaultWhenUnset;
}

export function getAuthTwoFactorEnvConfig(): AuthTwoFactorEnvConfig {
  return {
    emailTwoFactorEnabled: parseAuthBoolEnv(process.env.AUTH_EMAIL_2FA_ENABLED, false),
    emailTwoFactorRequiredForAllUsers: parseAuthBoolEnv(process.env.AUTH_EMAIL_2FA_REQUIRED_FOR_ALL_USERS, false),
    emailTwoFactorRequiredForAdmins: parseAuthBoolEnv(process.env.AUTH_EMAIL_2FA_REQUIRED_FOR_ADMINS, false),
  };
}

export type LoginTwoFactorUserShape = {
  id: number;
  isTwoFactorEnabled?: boolean | null;
  emailTwoFactorEnabled?: boolean | null;
  isCreator?: boolean | null;
};

export function shouldRequireEmailTwoFactorForLogin(input: {
  user: LoginTwoFactorUserShape;
  env: AuthTwoFactorEnvConfig;
}): boolean {
  const { user, env } = input;
  if (!env.emailTwoFactorEnabled) return false;
  if (env.emailTwoFactorRequiredForAllUsers) return true;
  if (env.emailTwoFactorRequiredForAdmins && Boolean(user.isCreator)) return true;
  return Boolean(user.isTwoFactorEnabled) || Boolean(user.emailTwoFactorEnabled);
}
