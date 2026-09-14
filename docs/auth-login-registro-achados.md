# Login e Registro — achados de segurança (2026-09-13)

Revisão da superfície de autenticação (`server/modules/auth/**` + client
`useLoginForm`/`useRegisterForm`/`auth.store`). Cada item abaixo foi
**verificado no código**, não inferido.

Item 1 foi corrigido na passada de 2026-09-13. Itens 2–10 foram aplicados na
passada seguinte (mesmo dia): cada um com a correção proposta abaixo.

---

## 1. ✅ CORRIGIDO — Lockout de conta arbitrária via fallback `endsWith`

**Arquivo**: `server/modules/auth/auth.repository.ts` (`findUserByIdentifier`)

`findUserByIdentifier` caía num fallback `email: { endsWith: input }` ordenado
por `id desc` quando o match exato falhava. Como o schema de login
(`login.schemas.ts`) nunca validou formato de e-mail — só limita tamanho — e o
controller só checa `identifier.includes("@")`, um chamador **não autenticado**
resolvia uma conta arbitrária:

```
POST /auth/login {"identifier": "@gmail.com"}   -> conta Gmail mais recente
POST /auth/login {"identifier": "o@gmail.com"}  -> joao@gmail.com
```

`login.controller.ts` então chamava
`recordAuthLoginFailure({ ip, userId: aqueleUsuario.id })`. Com os tiers de
lockout em **5 falhas → 15min** e **10 → 60min** (`login.lockout.ts`), dez
requests derrubavam a conta de um estranho por uma hora, sem o atacante nunca
descobrir o endereço dela. Variando o sufixo dava para mirar contas
específicas. `forgotPasswordPost` usa o mesmo helper, então um e-mail de reset
podia ser disparado para uma conta não pretendida.

**Corrigido** mantendo o fallback (linhas legadas dependem dele) mas só
deixando ele confirmar uma linha que seja **o mesmo endereço a menos de
espaços em volta** — a forma legada real. Um candidato cujo local part apenas
*termina com* a entrada (`"joao"` vs `"o"`) é rejeitado, e um match ambíguo
nunca elege "o mais novo". A regra foi extraída em funções puras
(`hasEmailLocalPart`, `isVerifiedLegacyEmailMatch`) e coberta por
`tests/auth/findUserByIdentifier.legacyFallback.test.mjs` — verificado que os
testes de ataque falham se a regra antiga voltar.

> **Por que não foi corrigido no schema**: adicionar `.email()` em
> `loginSchema` parece a correção óbvia, mas `validateBody` responde um
> `"Invalid request data."` genérico. Hoje quem digita o *username* em vez do
> e-mail recebe a mensagem específica `USERNAME_NOT_SUPPORTED` vinda do
> controller. Validar no schema mataria essa UX. A correção ficou no
> primitivo perigoso, não no chamador.

---

## 2. ✅ CORRIGIDO — HIGH — Reset de senha não invalida sessões existentes

**Arquivos**: `server/modules/auth/auth.controller.ts` — `legacyPasswordResetPost`
(l.31), `resetPasswordManualPost` (l.61), `adminForcePasswordResetPost` (l.138),
`changePasswordPost` (l.159)

Os quatro caminhos fazem apenas `prisma.user.update({ passwordHash })`. Nenhum
incrementa `sessionVersion`, chama `revokeRefreshTokensForUser` ou
`invalidateAuthUserCache`.

O mecanismo **existe e é aplicado**: o middleware compara `sessionVersion`
(`server/core/http/middleware/auth.ts:61,129`), e os três helpers são usados em
outros fluxos (eviction de sessão anônima, rotação de refresh).

**Impacto**: um atacante com um par access+refresh roubado continua dentro
depois de a vítima resetar a senha — o access token ainda passa na checagem de
`sessionVersion`, e o refresh token segue emitindo novos indefinidamente.
Reset de senha é *a* resposta padrão a comprometimento de conta, e hoje não
expulsa o atacante.

**Corrigido** em `auth.passwordWrite.ts` (`replacePasswordAndRevokeSessions`):
os quatro caminhos atualizam o hash, incrementam `sessionVersion` e revogam
refresh tokens na mesma transação, depois invalidam o cache. Change-password
desloga os outros dispositivos — comportamento correto após troca de senha.

---

## 3. ✅ CORRIGIDO — MEDIUM — Troca de senha rebaixa o custo do bcrypt de 12 para 10

**Arquivos**: `auth.controller.ts` linhas 30, 60, 137, 158

`hashPassword(plain, rounds = BCRYPT_COST)` tem default **12**
(`server/shared/security/password.ts:10`), e `register.controller.ts:120`
documenta explicitamente o bump de 10 → 12. Mas os quatro caminhos de escrita
de senha passam `10` na mão.

**Impacto**: um usuário que se registra com custo 12 e depois troca a senha cai
permanentemente para custo 10. O custo fica embutido no hash, então não é
recuperável sem outro reset.

**Corrigido**: as quatro chamadas usam o default `BCRYPT_COST` (12).

---

## 4. ✅ CORRIGIDO — MEDIUM — Turnstile quebra o login com 2FA

**Arquivo**: `client/src/features/auth/login/lib/useLoginForm.ts:248`

A resposta `require2FA` é HTTP **200** (`login.controller.ts:122`), então sai
pelo branch de *sucesso*. Só o `catch` reseta o widget do Turnstile (l.339-340).
O submit seguinte reenvia o **mesmo** `turnstileToken` (l.236), o siteverify da
Cloudflare rejeita token já consumido, e `requireTurnstileWhenConfigured`
devolve 400 `CAPTCHA_FAILED` (`shared/security/turnstile.ts:167`).

**Impacto**: com `TURNSTILE_SECRET_KEY_LOGIN` setado, **nenhum usuário com 2FA
consegue completar o login**. Hoje está latente porque o Turnstile não está
ligado (ver o contrato de ativação em `turnstile.ts`) — vira incidente no dia
em que alguém ligar.

**Corrigido**: o widget é resetado ao entrar no passo de 2FA (resposta 200 e
também no branch de erro que ainda é um passo 2FA).

---

## 5. ✅ CORRIGIDO — MEDIUM — Loop infinito silencioso no passo de 2FA

**Arquivo**: `client/src/features/auth/login/lib/login.twoFactorUi.ts:8`

O servidor emite `TWO_FACTOR_CHALLENGE_REQUIRED` (400) num único caso: o client
mandou um código **sem** challenge token (`login.controller.ts:107`). Mas
`useLoginForm.ts:294` roteia esse erro de volta pelo branch de 2FA, seta
`twoFactorChallengeToken` como `''` (o corpo do erro não traz token) e chama
`setLocalError('')`.

**Impacto**: o usuário reenvia, recebe o mesmo 400, **não vê mensagem nenhuma**,
e fica preso sem saída além de recarregar a página.

**Corrigido**: `TWO_FACTOR_CHALLENGE_REQUIRED` sai de `responseRequiresTwoFactorStep`
e passa por `responseRequiresPasswordStepRestart` — mostra o erro e volta ao
passo de senha.

---

## 6. ✅ CORRIGIDO — MEDIUM — Código 2FA aceita tentativas ilimitadas

**Arquivo**: `server/modules/auth/login/login.twoFactorChallenge.ts:51`

Num `reason: "INVALID"` a entrada permanece no mapa pelo TTL inteiro (10 min)
sem contador de tentativas. Um único `challengeToken` emitido aceita chutes
ilimitados num código de 6 dígitos. O único freio é o lockout de IP/usuário —
que é **fail-open em erro de banco** (`login.lockout.ts:63-69`), ou seja, um
soluço no Postgres remove o único limite.

A comparação do código também não é constant-time.

**Corrigido**: `EMAIL_TWO_FACTOR_MAX_FAILED_ATTEMPTS` apaga o challenge após 5
códigos errados; a comparação do código usa `crypto.timingSafeEqual`.

---

## 7. ✅ CORRIGIDO — LOW — Login bem-sucedido zera o contador de IP

**Arquivo**: `server/modules/auth/login/login.lockout.ts:87`

`recordAuthLoginSuccess` apaga as linhas de IP **e** de usuário. Um atacante com
uma conta válida pode chutar 4 vezes numa vítima, logar na própria conta do
mesmo IP para limpar o contador de IP, e repetir indefinidamente.

O tier por usuário ainda limita chutes contra uma vítima única, mas a proteção
de IP contra *spraying* por muitas contas é derrotada.

**Corrigido**: `recordAuthLoginSuccess` apaga só o contador do usuário. O
contador de IP permanece, então um login válido não reseta spray contra
outras contas.

---

## 8. ✅ CORRIGIDO — LOW — Regra de risco de registro não dispara em IP novo

**Arquivo**: `server/modules/auth/register/register.controller.ts:77`

`getAuthIpContext` (`register.risk.ts:104`) lê **só o cache**
(`ipIntelligenceCache.findUnique`) e devolve `providerType: "unknown"` num miss.
Então `HIGH_RISK_PROVIDER_TYPES.has(providerType) && recentExactIp >= 1`
(`register.risk.ts:235`) nunca dispara para um IP de hosting/VPN **visto pela
primeira vez** — exatamente o caso de abuso. A consulta que pode ir buscar ao
vivo (`getCachedIpIntelligence`) só acontece na l.127, depois do score já ter
passado.

**Corrigido**: `getCachedIpIntelligence` roda antes do score e o
`providerType` (hosting/VPN/Tor) alimenta `evaluateRegistrationAttempt`.

---

## 9. ✅ CORRIGIDO — LOW — Pré-checagem de duplicado usa `name`, que não tem índice único

**Arquivo**: `server/modules/auth/register/register.controller.ts:111`

`prisma/schema.prisma:14` declara `name String` sem `@unique`; só `username` e
`email` são únicos. Duas consequências:

1. O braço `name` do 409 não é respaldado por constraint — dois registros
   concorrentes com o mesmo display name passam os dois e o P2002 nunca
   dispara. A checagem dá falsa sensação de atomicidade.
2. Rejeita cadastro legítimo com `USER_ALREADY_EXISTS` sempre que o *display
   name* de alguma conta existente for igual ao username pedido, mesmo com o
   username livre.

**Corrigido**: a pré-checagem olha só `email` e `username` (únicos de
verdade). Display name igual a um username livre não bloqueia mais o cadastro.

---

## 10. ✅ CORRIGIDO — LOW — Códigos de erro sem mapeamento no client

**Arquivo**: `client/src/features/auth/login/lib/useLoginForm.ts:312`

`TWO_FACTOR_EXPIRED` e `TWO_FACTOR_CODE_REQUIRED` são emitidos pelo servidor mas
não existiam no `errorByCode` do client, então caíam numa mensagem genérica.

**Corrigido**: ambos (e `TWO_FACTOR_CHALLENGE_REQUIRED`) estão no mapa, com
chaves i18n em pt-BR / en / es.

---

## Nota — não é um achado

O challenge de 2FA vive num mapa em memória
(`login.twoFactorChallenge.ts:15`). Hoje é single-process (o compose não
declara réplicas), então funciona. Vira problema em escala horizontal, e
derruba challenges em voo a cada deploy. Registrado como limitação conhecida,
não como defeito.

---

## Passada 2026-09-13 (itens 1–10 auth + dashboard + vault)

1. **Reset one-shot** — `users.password_reset_version` + claim JWT `prv`. Forgot incrementa a versão antes de assinar; consume (`legacy-password-reset`) e qualquer write de senha incrementam de novo. Reuso ou link velho → 401 genérico (sem oráculo de user deletado).
2. **Troca de senha neste aparelho** — Settings faz toast → `logout()` → `/login`. O servidor já matava a sessão; o client não reemite cookie.
3. **Access JWT sem `sv`** — `isTokenSessionCurrent` rejeita payload sem `sv`. `signAccessToken` sempre emite `sv` (0 se ausente no user).
4. **2FA + SMTP falho** — challenge é apagado se o mailer rejeitar; `loginPost` devolve 503 `EMAIL_2FA_UNAVAILABLE`.
5. **POL pendente** — `pendingPolAccrual` faz `Math.min(1, share)` quando user HR > network HR.
6. **`pay-daily` idempotente** — `requireCriticalIdempotency` + marker axios `/energy-tax/pay-daily`.
7. **Smoke vault** — `tests/wallet/vault.move-retrieve.smoke.test.mjs` (inventory → vault → inventory).
8. **Legacy reset morto no login** — removidos `needsLegacyReset` / `handleLegacyReset` de `useLoginForm`. `POST /auth/legacy-password-reset` permanece (consume do e-mail).
9. **Turnstile no forgot** — purpose `forgot` (`TURNSTILE_SECRET_KEY_FORGOT` + widget na página de e-mail).
10. **`reportError`** — catches de write de senha (`PASSWORD_WRITE_FAILED`) e `linkReferral` (`LINK_REFERRAL_FAILED`).

---

## Cobertura desta passada

```
Tests:      findUserByIdentifier.legacyFallback + password-write session kill /
            bcrypt 12, 2FA attempt cap, lockout IP spray, register display-name
            409, hosting risk rule, twoFactorUi routing.
Security:   autenticação (brute force, lockout, enumeração), autorização de lookup,
            validação de input, invalidação de sessão no reset de senha.
Errors:     client mapeia TWO_FACTOR_EXPIRED / TWO_FACTOR_CODE_REQUIRED /
            TWO_FACTOR_CHALLENGE_REQUIRED.
Deferred:   challenge 2FA em memória (limitação conhecida, nota abaixo).
```
