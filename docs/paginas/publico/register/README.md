# Registro (pública)

## 📊 Resumo rápido

| | |
|---|---|
| **Rota (client)** | `/register` |
| **Componente** | `client/src/features/register/RegisterPage.tsx` + `lib/useRegisterForm.ts` |
| **Rota servidor** | `POST /auth/register` → `validateBody(registerBodySchema)` → `requireTurnstileWhenConfigured` → `server/modules/auth/register/register.controller.ts` (`registerPost`) |
| **Validação** | `server/modules/auth/register/registerBodySchema.ts` (zod, roda ANTES do controller via middleware) |
| **Anti-abuso** | `server/modules/auth/register/register.risk.ts` (`evaluateRegistrationAttempt`) — bloqueia com 429 antes até da checagem de duplicidade |
| **Emissão de sessão** | `server/modules/auth/auth.sessionIssue.ts` (mesma função do login/OAuth — ver doc do Login) |
| **Testes** | `tests/auth/{register.transaction, register.risk.fingerprint-bypass, register.risk, registerBodySchema.exhaustive, registerAllowedEmailDomains, session-issuance.characterization}.test.mjs` |

## 1. Fluxo

```
POST /auth/register
   ↓
validateBody(registerBodySchema) — 400 se inválido (username/email/senha/acceptTerms)
   ↓
requireTurnstileWhenConfigured — 400 CAPTCHA se ligado e token ausente/inválido
   ↓
evaluateRegistrationAttempt — 429 REGISTRATION_COOLDOWN se fingerprint/IP/rede repetiu recente
   ↓
duplicidade de email/username (case-insensitive) → 409 USER_ALREADY_EXISTS
   ↓
IP é VPN/proxy/Tor? → 403 VPN_PROXY_BLOCKED
   ↓
transação atômica:
  cria usuário
  se refCode válido e não é auto-indicação → cria Referral
  concede miner de boas-vindas (inventory)
  provisiona sala/rack inicial
  grava userIpLog (registerCount++)
   ↓
issueAuthSessionForUser() → cookies + sessão (autentica na hora, sem exigir confirmar e-mail antes)
   ↓
dispara e-mail de verificação em paralelo (não bloqueia a resposta)
   ↓
201 { ok:true, user }
```

## 2. Regras de negócio

- **Domínios de e-mail permitidos**: só um allowlist fixo (`gmail.com`, `outlook.com`, `hotmail.com`, `yahoo.com`, `icloud.com`, `proton.me`/`protonmail.com`, `tuta.com`/`tutanota.com`) — `registerAllowedEmailDomains.ts`. O client tem um arquivo com o mesmo nome, mas é só um stub permissivo (`return true` sempre, documentado no próprio header) — a validação de verdade é só no servidor.
- **Auto-indicação bloqueada**: se o `refCode` aponta pra uma conta com o mesmo IP de registro do novo cadastro, a indicação é silenciosamente ignorada (loga aviso, não cria `Referral`, mas o cadastro segue normal).
- **`refCode` inválido/inexistente**: também ignorado silenciosamente, sem erro — só não cria `Referral`.
- **E-mail não precisa estar verificado pra usar a conta**: o usuário já sai autenticado no cadastro; a verificação de e-mail é assíncrona e não bloqueia nada hoje (`requireEmailVerified` existe mas não está plugado nessas rotas — ver doc do Login).

## 3. Unificação de sessão (mudança de comportamento aprovada)

Registro passou a usar a mesma `issueAuthSessionForUser` do login/OAuth (ver `docs/paginas/publico/login/`). Isso significa que registro **agora também limpa o contador de tentativas de login falhas do IP** — antes só login e cadastro via Google faziam isso. Comportamento aprovado pelo usuário, caracterizado em teste antes/depois da mudança.

## 4. Achados caracterizados, não corrigidos (decisão do usuário)

- **Bypass do fingerprint anti-abuso**: `register.risk.ts` usa um fingerprint de dispositivo não assinado, mandado pelo client via header `x-anti-bot-payload`. Se o header simplesmente não for enviado, o fingerprint vira a string `"unknown"` e a regra de "mesmo fingerprint se cadastrando de novo" nunca dispara pra esse valor — ou seja, um atacante pode contornar essa regra específica só omitindo o header. As outras regras (IP exato, rede) continuam valendo. Testado como está (`register.risk.fingerprint-bypass.test.mjs`), não corrigido — mudar comportamento anti-abuso precisa de decisão de produto, não só de código.
- **Duplicação client/servidor do allowlist de e-mail**: não é bem uma duplicação de risco — o client é intencionalmente permissivo (só valida formato, deixa o servidor rejeitar de verdade). Não precisa de teste de paridade porque não há paridade pra manter.

## 5. Sobre a flakiness nos testes deste módulo

Os testes de registro usam IPs públicos aleatórios (pra não colidir com o rate-limit de outros testes rodando no mesmo Postgres). Ocasionalmente um desses IPs aleatórios é classificado como VPN/proxy pela checagem real de inteligência de IP (`proxycheck_v2`), fazendo o teste falhar com 403 em vez do 201 esperado — isso não é bug de código nem regressão, é inerente a testar contra uma checagem de ameaça real com IPs sorteados. Rodar de novo resolve.
