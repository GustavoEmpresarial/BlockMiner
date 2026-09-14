/** Detect login responses that require a second 2FA step. */
export function responseRequiresTwoFactorStep(body: {
  require2FA?: boolean;
  code?: string;
}): boolean {
  if (body.require2FA === true) return true;
  return String(body.code || '') === 'TWO_FACTOR_REQUIRED';
}

/** Server rejected a 2FA code submitted without a challenge token — restart at password. */
export function responseRequiresPasswordStepRestart(body: { code?: string }): boolean {
  return String(body.code || '') === 'TWO_FACTOR_CHALLENGE_REQUIRED';
}
