export function isAdminKeyedPasswordResetApiEnabled(): boolean {
  const raw = String(process.env.ADMIN_KEYED_PASSWORD_RESET_ENABLED ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}
