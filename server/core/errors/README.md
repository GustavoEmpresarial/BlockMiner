# Error collection & observability contract

How every module in this server reports a failure. One entry point, one shape,
one redaction layer.

```
módulo (catch)                 core/errors                     core/logger
──────────────                 ───────────                     ───────────
  reportError({…})  ──────►  fingerprint  ─┐
                             error_id      ├──►  redactContext  ──►  JSON line
                             request_id    │                          stdout
                             classify      ─┘
```

## Regra única

Num `catch`, **não** chame `log.error` direto. Chame `reportError`.

```ts
import { reportError } from "../../core/errors/index.js";

try {
  await processWithdrawal(id);
} catch (err) {
  reportError({
    code: "WITHDRAWAL_PROCESSING_FAILED", // estável, nunca texto livre
    category: "BUSINESS",
    severity: "ERROR",
    impact: "CRITICAL",
    module: "wallet",
    operation: "processWithdrawal",
    error: err,
    context: { withdrawalId: id, userId },
    req, // opcional — traz o request_id junto
  });
}
```

`reportError` **nunca lança**. Uma falha ao reportar jamais pode mascarar ou
substituir o erro original.

## Os dois eixos que as pessoas confundem

| Campo | Responde | Único por |
|---|---|---|
| `error_id` | "qual foi *esta* ocorrência?" | ocorrência |
| `fingerprint` | "qual é *este problema*?" | grupo |

`error_id` (`err_<time36><rand>`) é o código que o suporte pede ao jogador — é
prefixado por tempo, então ordena cronologicamente numa busca de log.

`fingerprint` (`fp_<sha1:10>`) é `module:category:code` hasheado. 10.000
ocorrências do mesmo defeito viram **um** problema agrupado, não 10.000.

## Severity ≠ impact

Filtrar só por severity não distingue estes dois casos:

```
severity=ERROR  impact=LOW       uma busca falhou
severity=ERROR  impact=CRITICAL  um torneio não pagou ninguém
```

Por isso os dois campos existem. `impact` responde **raio de alcance**;
`severity` responde **gravidade técnica**. Default de `impact` é `MEDIUM`.

- `LOW` — degradação isolada, usuário mal percebe
- `MEDIUM` — uma funcionalidade quebrada para alguns usuários
- `HIGH` — usuário perde algo concreto (dinheiro, prêmio, dado)
- `CRITICAL` — perda financeira/integridade que não se recupera sozinha

## Categorias

`CLIENT` · `AUTH` · `DATABASE` · `EXTERNAL_API` · `BUSINESS` ·
`INFRASTRUCTURE` · `SECURITY` · `UNKNOWN`

Use `SECURITY` para eventos de detecção (token inválido, IDOR tentado, replay),
não para erros comuns — separá-los é o que permite alimentar detecção depois.

## Redação — o que nunca sai no log

`redactContext` roda em **todo** report, sem opção de desligar. Ela corta:

**Por nome de chave** — `password`, `secret`, `token`, `authorization`,
`cookie`, `api_key`, `private_key`, `seed`, `mnemonic`, `2fa`, `otp`, `pin`,
`cvv`, `card`, `credential`, `signature`, `session_id`.

**Por formato do valor**, mesmo sob chave inocente:
- JWT (`eyJ….….`) em qualquer posição da string
- `Bearer <token>` embutido no meio de uma mensagem de upstream
- blocos PEM `-----BEGIN … PRIVATE KEY-----`
- chaves `sk_live_…` / `rk_test_…`

**Em qualquer profundidade**, inclusive **dentro de arrays** — arrays já
passaram direto sem redação, e `{ items: [{ password }] }` vazava a senha em
texto claro. Há teste de regressão para isso em
`tests/security/error-redaction.test.mjs`.

### Falsos positivos são um bug também

Contexto de blockchain **precisa** sobreviver à redação — `txHash`,
`walletAddress`, `blockNumber`, `chainId`, `rpcProvider` são exatamente o que
se usa para investigar um incidente Web3. Os padrões acima são deliberadamente
estreitos por isso, e há teste guardando essa fronteira.

### Limites de recurso

| Guarda | Valor | Por quê |
|---|---|---|
| profundidade | 6 níveis → `[TRUNCATED]` | limita trabalho por report |
| referência circular | `[CIRCULAR]` | senão estoura a pilha e o report se perde |
| string | 512 chars → truncada | um report não pode inundar o log |

## Stack traces

Só em `ERROR` e `CRITICAL`. Em `INFO`/`DEBUG` viram ruído sem valor.

## O que ainda NÃO existe

Sendo honesto sobre o escopo atual — isto é uma camada de **coleta e
classificação**, não uma plataforma de observabilidade:

- sem storage de erros (só a linha de log)
- sem dashboard, sem alerta automático, sem error rate / error budget
- sem breadcrumbs nem distributed tracing
- sem ciclo de vida (NEW → ACKNOWLEDGED → RESOLVED)
- `request_id` só existe quando o `req` é passado

O `fingerprint` foi desenhado para que, quando um backend de error tracking
entrar, o agrupamento já esteja pronto e estável.

## Testes

```
tests/security/error-redaction.test.mjs
```

Trate uma falha ali como incidente de segurança, não como teste quebrado: o que
ela mede é se segredo está chegando em linha de log.
