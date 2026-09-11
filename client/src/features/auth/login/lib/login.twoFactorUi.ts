/** Detect login responses that require a second 2FA step. */
export function responseRequiresTwoFactorStep(body: {
  require2FA?: boolean;
  code?: string;
}): boolean {
  if (body.require2FA === true) return true;
  const code = String(body.code || '');
  return code === 'TWO_FACTOR_REQUIRED' || code === 'TWO_FACTOR_CHALLENGE_REQUIRED';
}
