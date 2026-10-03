# Fase 7: Segurança e Pentest em Container Kali

- **Data**: 2026-10-03
- **Branch**: `fix/swap-pol-blk-balance`
- **Alvo**: `http://127.0.0.1:5117` (Localhost exclusivo)
- **Container Utilizado**: `kali-pentest:latest`
- **Scripts**: `tests/security/run-kali-swap-audit.sh`, `tests/security/kali_swap_pentest.py`, `tests/security/local-swap-test-server.mjs`
- **Estado do Gate G7**: `VERIFICADO`

---

## 1. Guarda Contra Produção e Isolamento do Ambiente

Conforme mandatório pelas regras do projeto:
- O script contém bloqueio incondicional contra hostnames de produção:
  ```python
  if "blockminer.space" in TARGET or "dev.blockminer.space" in TARGET:
      print("[FATAL] PROIBIDO: Pentest nunca pode atingir blockminer.space nem dev.blockminer.space!")
      sys.exit(1)
  ```
- O pentest foi executado a partir do container Docker isolado `kali-pentest:latest` operando em `--network host` contra o servidor efêmero de teste escutando exclusivamente em `127.0.0.1:5117`.

---

## 2. Matriz de Vetores OWASP Avaliados

| Categoria OWASP | Teste de Pentest | Vetores & Payloads Testados | Resultado |
|---|---|---|---|
| **A01: Broken Access Control** | `AUTH_UNAUTHENTICATED_GET` | Acesso anônimo a `GET /api/swap/balances` | ✅ **PASS** (401 Unauthorized) |
| **A01: Broken Access Control** | `AUTH_UNAUTHENTICATED_POST` | Acesso anônimo a `POST /api/swap/execute` | ✅ **PASS** (401 Unauthorized) |
| **A01: Broken Access Control** | `IDOR_USER_INJECTION` | Injeção de `userId`/`user_id` em payload para manipular saldo alheio | ✅ **PASS** (400 Rejeitado por Zod) |
| **A02: Cryptographic Failures** | `AUTH_TAMPERED_TOKEN` | Assinatura JWT adulterada / forjada via HMAC HS256 | ✅ **PASS** (401 Token Inválido) |
| **A03: Injection** | `INJECTION_ATTACK` | Payloads SQLi (`' OR 1=1 --`, `; DROP TABLE users;`) e XSS (`<script>`) | ✅ **PASS** (400, 0 erros 500, sem leaks) |
| **A04: Insecure Design** | `PROHIBITED_PAIR_BYPASS` | Tentativa de swap reverso (`BLK->POL`, `BLK->SHIB`) ou moedas não autorizadas (`POL->USDC`) | ✅ **PASS** (400 Par Proibido) |
| **A04: Insecure Design** | `NUMERIC_BOUNDARY_ATTACK` | Valores zero, negativos (`-1`, `-999999`), `NaN`, `Infinity` e subatômicos (`1e-25`) | ✅ **PASS** (400 Montante Inválido) |
| **A05: Security Misconfiguration**| `MASS_ASSIGNMENT` | Injeção de campos privilegiados (`role`, `isAdmin`, `polBalance`, `blkBalance`) | ✅ **PASS** (400 Zod `.strict()`) |
| **A09: Logging & Monitoring** | `INFORMATION_DISCLOSURE` | Fuzzing com JSON malformado para detectar stack trace ou vazamento de banco | ✅ **PASS** (0 dados internos expostos) |

---

## 3. Resultados Detalhados do Pentest com Container Kali

```text
================================================================================
[*] Starting Kali Linux Security Assessment on Swap Module: http://127.0.0.1:5117
================================================================================
[PASS] AUTH_UNAUTHENTICATED_GET: GET /api/swap/balances rejeita requisição não autenticada com 401
[PASS] AUTH_UNAUTHENTICATED_POST: POST /api/swap/execute rejeita requisição não autenticada com 401
[PASS] AUTH_TAMPERED_TOKEN: Assinatura JWT forjada rejeitada com 401
[PASS] IDOR_USER_INJECTION: Injeção de userId bloqueada por schema validation (400)
[PASS] MASS_ASSIGNMENT: Todos os campos não autorizados (.strict()) foram rejeitados com 400
[PASS] PROHIBITED_PAIR_BYPASS: Todos os pares reversos e moedas não autorizadas foram rejeitados com 400
[PASS] NUMERIC_BOUNDARY_ATTACK: Todos os montantes zero, negativos, NaN e infinitesimais foram rejeitados com 400
[PASS] INJECTION_ATTACK: Tentativas de injeção SQL/XSS foram bloqueadas sem erro 500 ou vazamento de banco
[PASS] INFORMATION_DISCLOSURE: Nenhum stack trace interno ou variável de ambiente exposta em respostas de erro
================================================================================
[*] Pentest Concluído: 9 testes executados | 9 PASS | 0 FAIL
================================================================================
```

---

## 4. Auditoria de Dependências (`npm audit`)

A auditoria com `npm audit --omit=dev --audit-level=critical` confirmou:
- **Zero vulnerabilidades críticas** identificadas.
- Vulnerabilidades residuais catalogadas em bibliotecas terceiras de upstream (`multer`, `nodemailer`, `mysql2`, `sharp`, `valibot`, `deepmerge-ts` transitivo do prisma cli), as quais não afetam a lógica de swap e requerem breaking change de Prisma/Nodemailer já documentada no backlog de infraestrutura.

---

## 5. Evidências de Validação

```text
EVIDÊNCIA-ID: EV-0013
Estado: VERIFICADO
Comando: tests/security/run-kali-swap-audit.sh
Ambiente: local (container Docker kali-pentest:latest contra localhost:5117)
Resultado: 9/9 testes de invasão aprovados, 0 falhas, 0 vulnerabilidades críticas de aplicação.
Arquivos: tests/security/kali_swap_pentest.py, tests/security/local-swap-test-server.mjs, tests/security/run-kali-swap-audit.sh
Conclusão: O módulo de swap está protegido contra abusos de autenticação, IDOR, injeção, mass assignment e bypasses de lógica financeira.
```

---

## 6. Conclusão do Gate G7

O Gate G7 foi atendido com sucesso: pentest executado em container Kali oficial contra localhost exclusivo, vetores OWASP cobertos e sem achados pendentes no código auditado.
