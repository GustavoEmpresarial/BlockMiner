# Login (pública)

## 📊 Resumo rápido

| | |
|---|---|
| **Rota (client)** | `/login` |
| **Componente** | `client/src/features/login/LoginPage.tsx` + `lib/useLoginForm.ts` |
| **Rota servidor** | `POST /auth/login` → `server/modules/auth/login/login.controller.ts` (`loginPost`) |
| **Emissão de sessão** | `server/modules/auth/auth.sessionIssue.ts` (`issueAuthSessionForUser`) — compartilhada com registro e OAuth (Google/SatsPay) |
| **Lockout** | `server/modules/auth/login/login.lockout.ts` — Postgres (`callbackQueue`, tipo `SEC_LOCK`) |
| **2FA por e-mail** | `server/modules/auth/login/login.twoFactor.ts` + `login.twoFactorChallenge.ts` (Map em memória) |
| **Testes** | `tests/auth/{login.lockout, session-issuance.characterization, cookies, authTokens, securityLogger, login.twoFactorChallenge, turnstile}.test.mjs` |

## 1. Fluxo

```
identifier + senha
   ↓
IP bloqueado? → 403 ACCOUNT_LOCKED
   ↓
identifier sem "@" → 400 USERNAME_NOT_SUPPORTED (só e-mail é aceito)
   ↓
usuário não encontrado → compara com hash dummy (timing-safe) → 401
   ↓
usuário+IP bloqueado? → 403
   ↓
senha errada → registra falha → 401
   ↓
banido? → 403 ACCOUNT_DISABLED
   ↓
IP é VPN/proxy/Tor? → 403 VPN_PROXY_BLOCKED
   ↓
2FA por e-mail exigido?
   ├─ sem token/challenge → envia código, devolve 200 com require2FA:true
   └─ com token/challenge → valida (login.twoFactorChallenge.ts)
   ↓
issueAuthSessionForUser() → cookies + sessão
   ↓
200 { ok:true, user }
```

## 2. Unificação de emissão de sessão (2026-09-11)

Login, registro e OAuth (Google/SatsPay) precisam fazer exatamente a mesma coisa depois de validar as credenciais: atualizar `lastLoginAt`/IP/user-agent, incrementar `sessionVersion`, revogar refresh tokens antigos, invalidar cache, assinar access token, criar refresh token, setar os 3 cookies (access/refresh/csrf), e limpar o contador de tentativas falhas do IP.

Antes desta passada, essa lógica estava **copiada e colada 2 vezes** (`login.controller.ts` e `register.controller.ts`), enquanto Google/SatsPay OAuth já usavam a função compartilhada `auth.sessionIssue.ts`. Unificado: os três agora chamam `issueAuthSessionForUser`.

**Mudança de comportamento observável, aprovada pelo usuário**: registro por e-mail/senha agora também limpa o contador de tentativas de login falhas do IP (`recordAuthLoginSuccess`) — antes só login e cadastro via Google faziam isso. Testes de caracterização (`tests/auth/session-issuance.characterization.test.mjs`) foram escritos ANTES da unificação pra provar o comportamento antigo, e usados DEPOIS pra confirmar que só essa diferença mudou (tudo mais idêntico).

## 3. O que foi caracterizado mas não corrigido (decisão do usuário)

- **`auth.repository.findUserByIdentifier`**: tem um fallback legado que aceita `endsWith` (termina com) em vez de bater exato no e-mail. Risco teórico de confundir contas. Não alterado — só há um teste de fronteira travando o comportamento atual (`tests/auth/auth.repository.boundary` — ver módulo Registro).
- **`login.twoFactorChallenge.ts`**: challenges ficam num `Map` em memória — não sobrevive a restart nem funciona com múltiplas instâncias do servidor. Testado como está (`login.twoFactorChallenge.test.mjs`), correção real (Redis) fica pra depois.
- **`turnstile.ts`**: sem `TURNSTILE_SECRET_KEY` configurado, o gate é totalmente no-op — nenhum captcha é exigido hoje em produção. Comportamento documentado e testado (`turnstile.test.mjs`), não é bug, é a configuração atual.

## 4. Cobertura de testes adicionada nesta passada

Todos os arquivos abaixo tinham **zero** teste antes:
- `cookies.ts` (RECOVERED/`@ts-nocheck`) — flags de cookie por ambiente, bug do `Set-Cookie` sendo sobrescrito, comparação timing-safe do secret admin.
- `authTokens.ts` (RECOVERED/`@ts-nocheck`) — assinatura/verificação de JWT, criação/parse de refresh token.
- `securityLogger.ts` (RECOVERED/`@ts-nocheck`) — wrapper de log de segurança.
- `login.twoFactorChallenge.ts` — issue/verify/expiração/uso único do desafio 2FA.
- `turnstile.ts` — fail-open vs fail-closed, resolução de secret por propósito, middleware.
