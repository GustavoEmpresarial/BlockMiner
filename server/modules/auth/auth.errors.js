/**
 * User-facing auth messages (Portuguese) + stable JSON shape for login/register errors.
 * Never include passwords, OTP codes, challenge tokens, or cookies in these payloads.
 */
export const AUTH_LOGIN_MESSAGES = {
    INVALID_CREDENTIALS: "Credenciais inválidas.",
    INVALID_2FA: "Código 2FA inválido ou expirado.",
    TWO_FACTOR_EXPIRED: "Código expirado. Solicite um novo código de verificação.",
    ACCOUNT_DISABLED: "Conta bloqueada.",
    TWO_FACTOR_CHALLENGE_REQUIRED: "Sessão de verificação incompleta. Volte e solicite um novo código.",
    TWO_FACTOR_CODE_REQUIRED: "Informe o código de verificação enviado ao seu e-mail.",
    REQUIRE_2FA_EMAIL: "Digite o código enviado ao seu e-mail.",
    EMAIL_2FA_UNAVAILABLE: "Verificação por e-mail indisponível no momento. Tente mais tarde.",
    SERVICE_UNAVAILABLE: "O servidor está ocupado no momento. Aguarde alguns segundos e tente entrar novamente.",
    INTERNAL: "Não foi possível concluir o login. Tente novamente.",
    USERNAME_NOT_SUPPORTED: "O login com nome de usuário foi desativado. Utilize seu endereço de e-mail.",
    ACCOUNT_LOCKED: "Muitas tentativas de login. Tente novamente mais tarde.",
    VPN_PROXY_BLOCKED: "VPN, proxy, Tor ou Cloudflare WARP não são permitidos. Desligue e tente de novo.",
    USERSCRIPT_MANAGER_BLOCKED: "Tampermonkey ou Violentmonkey detectado. Remova a extensão do navegador e faça login novamente.",
};
export function buildAuthFailureJson(code, message, extra) {
    return {
        ok: false,
        code,
        message,
        error: message,
        ...(extra && typeof extra === "object" ? extra : {}),
    };
}
