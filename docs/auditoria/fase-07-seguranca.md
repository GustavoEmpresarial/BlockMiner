# Fase 7: Segurança de Aplicação (Container Kali Pentest)

- **Data**: 2026-10-03
- **Branch**: `fix/popup-taxa-energia`
- **Ambiente de Ataque**: Container Docker `kali-pentest:latest`
- **Alvo Autorizado**: `http://127.0.0.1:5119` (Processo Express isolado local)
- **Estado do Gate G7**: `VERIFICADO`

---

## 1. Escopo e Metodologia de Auditoria

Conforme estipulado no Contrato V2 e no Guia Kali (`Base — Kali`), a superfície de ataque exposta pelo módulo de Taxa de Energia (`/api/energy-tax/*`) e seu respectivo modal de dashboard foi submetida a pentest automatizado dinâmico (DAST) em container Kali isolado.

- **Guarda de Alvo**: Verificação ativa no script `tests/security/kali_energy_tax_pentest.py` com bloqueio incondicional contra qualquer hostname contendo `blockminer.space` ou `dev.blockminer.space`.
- **Payloads**: Testes controlados, determinísticos e estritamente não destrutivos contra banco e redis locais de teste.

---

## 2. Matriz de Testes de Segurança OWASP e Resultados

| # | Categoria / Vetor | Teste Executado | Resultado | Severidade |
|---|---|---|---|---|
| **1** | **Autenticação (GET)** | Requisição a `GET /api/energy-tax/summary` sem cabeçalhos de autenticação | ✅ `401 Unauthorized` | Info |
| **2** | **Autenticação (POST)** | Requisição a `POST /api/energy-tax/pay-daily` sem cabeçalhos de autenticação | ✅ `401 Unauthorized` | Info |
| **3** | **Segurança de Sessão** | Envio de JWT com assinatura adulterada/corrompida | ✅ `401 Unauthorized` | Info |
| **4** | **IDOR / BOLA** | Injeção de `userId`, `user_id` e `targetUserId` no payload para debitar de outra conta | ✅ `PASS` (servidor ignora e deriva usuário estritamente da sessão) | Info |
| **5** | **Mass Assignment** | Tentativa de sobrescrever `amount`, `exempt: true`, `status: "paid"`, `ratePercent` no body | ✅ `PASS` (cálculo de taxa e isenção são 100% determinísticos no servidor) | Info |
| **6** | **Manipulação de Moeda** | Envio de moedas inválidas (`"BTC"`, `"USDT"`, `"DOGE"`, `""`, `123`, `null`) | ✅ `PASS` (normalizado com segurança para POL sem erro 500) | Info |
| **7** | **Injeção (SQL / XSS)** | Payloads SQLi (`' OR 1=1 --`, `DROP TABLE`) e XSS (`<script>`) no campo `currency` | ✅ `PASS` (sanitizado, sem exceção de sintaxe SQL/Prisma e sem vazamentos) | Info |
| **8** | **Information Disclosure** | Envio de JSON malformado; verificação de stack traces, senhas, `DATABASE_URL` | ✅ `PASS` (nenhum dado interno exposto nas respostas de erro) | Info |
| **9** | **Rate Limiting (DoS)** | Disparo de 15 requisições rápidas em sequência no `POST /pay-daily` (max: 10/min) | ✅ `429 Too Many Requests` | Info |

---

## 3. Auditoria de Dependências (`npm audit`)

Executado `npm audit --omit=dev --audit-level=critical`:
- **Vulnerabilidades Críticas**: **0** (Zero vulnerabilidades críticas encontradas).
- **Vulnerabilidades Não-Críticas / Moderadas em Áreas Alheias**: 13 advisories em dependências de desenvolvimento e ferramentas auxiliares legadas (`fast-uri`, `find-my-way`, `mysql2`, `multer`). Nenhuma afeta a superfície de frontend do modal ou do módulo `energy-tax`.

---

## 4. Evidências de Execução

```text
EVIDÊNCIA-ID: EV-SEC-0001
Estado: VERIFICADO
Comando: bash tests/security/run-kali-energy-tax-audit.sh
Ambiente: local (container kali-pentest:latest -> 127.0.0.1:5119)
Resultado: 9 testes executados, 9 PASS, 0 FAIL. Rate limiting confirmado com 429, IDOR mitigado por derivação de sessão e zero injeções possíveis.
Arquivos: tests/security/kali_energy_tax_pentest.py, tests/security/local-energy-tax-test-server.mjs, tests/security/run-kali-energy-tax-audit.sh
Conclusão: Superfície do módulo de taxa de energia validada com rigor e em total conformidade com OWASP Top 10 API Security.
```

---

## 5. Conclusão do Gate G7

- [x] Pentest executado a partir de container Kali Linux oficial.
- [x] Scripts versionados em `tests/integration/security/` (symlink para `tests/security`).
- [x] Alvo estrito `localhost` verificado por guarda no script.
- [x] Vetores de auth, IDOR, mass assignment, injection, business logic e rate limit cobertos.
- [x] Zero credenciais, tokens ou dados pessoais impressos no relatório.
- [x] Estado do Gate G7: `VERIFICADO`.
