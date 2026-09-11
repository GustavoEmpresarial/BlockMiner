/**
 * Cloudflare Turnstile gate — porte real de legacy/server/middleware/turnstile.ts
 * (PROGRESSO.txt item 89).
 *
 * ANTES (bug corrigido aqui): o middleware checava apenas se o token EXISTIA no body e
 * chamava `next()` — nunca batia no `siteverify` da Cloudflare. Qualquer string (`"x"`)
 * passava. Como `TURNSTILE_SECRET_KEY` nunca esteve setado em produção (nem no legacy),
 * não havia dano ativo, mas era uma armadilha latente: setar a env dava uma falsa sensação
 * de proteção anti-bot, com os tokens seguindo sem validação nenhuma.
 *
 * Contrato de ativação (fail-closed por padrão): enquanto NENHUM secret estiver setado, o
 * middleware é no-op e o widget do frontend não renderiza — exatamente o comportamento de
 * hoje, então portar isto não muda nada em produção até alguém decidir ligar. Para ligar
 * de verdade é preciso o par completo (secret no servidor + site key no cliente), senão
 * logins passariam a falhar com CAPTCHA_REQUIRED por falta de token:
 *   - servidor: TURNSTILE_SECRET_KEY (ou TURNSTILE_SECRET_KEY_LOGIN / _REGISTER)
 *   - cliente:  VITE_TURNSTILE_SITE_KEY (ou VITE_TURNSTILE_SITE_KEY_LOGIN / _REGISTER)
 *
 * Diferenças deliberadas em relação ao legacy:
 *  - `TURNSTILE_USE_CLOUDFLARE_DUMMY_KEYS` / `ALLOW_TURNSTILE_DUMMY_IN_PRODUCTION` /
 *    `runTurnstileStartupChecks()` NÃO foram portados: eram um modo de teste do legacy que
 *    injeta o secret dummy público da Cloudflare (banner rosa de teste, sem segurança real)
 *    e um guard de boot pra impedir que isso vazasse pra produção. Portar o modo dummy só
 *    pra depois precisar de um guard contra ele mesmo adiciona superfície de risco sem
 *    ganho — aqui, sem secret = desligado, com secret = validação real. Só isso.
 *  - `TURNSTILE_FAIL_OPEN` foi mantido (mesma semântica do legacy): se a chamada à
 *    Cloudflare falhar por rede/timeout, deixa passar em vez de derrubar o login do site
 *    inteiro. Sem a flag, falha fechado.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { logger } from "../../core/logger/index.js";
import { authLoginTrace } from "../security/authDebug.js";

const log = logger.child("Turnstile");

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** Nunca deixar uma chamada externa segurar um login indefinidamente. */
const SITEVERIFY_TIMEOUT_MS = 10_000;

export type TurnstilePurpose = "login" | "register" | undefined;

function envFlag(name: string): boolean {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/** Secret específico do propósito, com fallback pro genérico (mesma precedência do legacy). */
export function resolveTurnstileSecret(purpose?: TurnstilePurpose): string {
  const fallback = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
  if (purpose === "login") {
    return String(process.env.TURNSTILE_SECRET_KEY_LOGIN || "").trim() || fallback;
  }
  if (purpose === "register") {
    return String(process.env.TURNSTILE_SECRET_KEY_REGISTER || "").trim() || fallback;
  }
  return fallback;
}

/** True quando qualquer secret está configurado — o gate está ativo. */
export function isTurnstileEnforced(): boolean {
  return (
    resolveTurnstileSecret(undefined).length > 0 ||
    resolveTurnstileSecret("login").length > 0 ||
    resolveTurnstileSecret("register").length > 0
  );
}

type TurnstileVerifyResult = { ok: true } | { ok: false; code: "CAPTCHA_REQUIRED" | "CAPTCHA_FAILED" };

/**
 * Injetável nos testes pra cobrir sucesso/falha/erro-de-rede sem depender da Cloudflare
 * real — mesma convenção já usada pelo worker do Telegram (`telegram.worker.ts`).
 * Só o que este módulo consome da resposta é tipado.
 */
type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: URLSearchParams; signal?: AbortSignal },
) => Promise<{ json: () => Promise<unknown> }>;

type TurnstileSiteverifyJson = { success?: boolean; "error-codes"?: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Valida um token contra o siteverify da Cloudflare. Sem secret configurado devolve
 * `{ok:true}` (gate desligado) — o chamador decide se sequer chega aqui.
 */
export async function verifyTurnstileToken(
  token: unknown,
  remoteIp: string | undefined,
  options: { secret?: string; fetchImpl?: FetchLike } = {},
): Promise<TurnstileVerifyResult> {
  const secret = String(options.secret ?? process.env.TURNSTILE_SECRET_KEY ?? "").trim();
  if (!secret) return { ok: true };

  const t = typeof token === "string" ? token.trim() : "";
  // Sem token não há o que verificar — corta antes de gastar uma chamada de rede.
  if (!t) return { ok: false, code: "CAPTCHA_REQUIRED" };

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", t);
  if (remoteIp) body.set("remoteip", remoteIp);

  const doFetch = options.fetchImpl ?? fetch;

  try {
    const res = await doFetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    const parsed: unknown = await res.json().catch(() => ({}));
    const json = isRecord(parsed) ? (parsed as TurnstileSiteverifyJson) : {};
    if (json.success === true) return { ok: true };
    log.warn("turnstile.verification_failed", { errorCodes: json["error-codes"] });
    return { ok: false, code: "CAPTCHA_FAILED" };
  } catch (e: unknown) {
    // Rede/timeout/Cloudflare fora do ar — NÃO é o usuário falhando o captcha.
    const message = e instanceof Error ? e.message : String(e);
    log.error("turnstile.request_error", { message });
    if (envFlag("TURNSTILE_FAIL_OPEN")) return { ok: true };
    return { ok: false, code: "CAPTCHA_FAILED" };
  }
}

function normalizePurpose(arg: unknown): TurnstilePurpose {
  if (arg === "login" || arg === "register") return arg;
  if (arg && typeof arg === "object") {
    const p = (arg as { purpose?: unknown }).purpose;
    if (p === "login" || p === "register") return p;
  }
  return undefined;
}

type RequireTurnstileArg =
  | { purpose?: "login" | "register"; fetchImpl?: FetchLike }
  | "login"
  | "register"
  | undefined;

/** Middleware: no-op sem secret; com secret, exige token válido de verdade. */
export function requireTurnstileWhenConfigured(arg?: RequireTurnstileArg): RequestHandler {
  const purpose = normalizePurpose(arg);
  const fetchImpl = arg && typeof arg === "object" ? arg.fetchImpl : undefined;
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const secret = resolveTurnstileSecret(purpose);
    if (!secret) {
      next();
      return;
    }
    const bodyToken = (req.body as { cfTurnstileToken?: unknown } | undefined)?.cfTurnstileToken;
    const token = bodyToken ?? req.headers["x-turnstile-token"];
    const ip = String(req.ip || req.socket?.remoteAddress || "");
    const result = await verifyTurnstileToken(token, ip, { secret, fetchImpl });
    if (!result.ok) {
      log.warn("turnstile.blocked", { path: req.path, code: result.code });
      authLoginTrace("AUTH_TURNSTILE_BLOCKED", req, {
        code: result.code,
        purpose: purpose ?? "generic",
        hasToken: Boolean(String(token ?? "").trim()),
        httpStatus: 400,
      });
      res.status(400).json({
        ok: false,
        code: result.code,
        message:
          result.code === "CAPTCHA_REQUIRED"
            ? "Human verification is required."
            : "Human verification failed. Please try again.",
      });
      return;
    }
    next();
  };
}
