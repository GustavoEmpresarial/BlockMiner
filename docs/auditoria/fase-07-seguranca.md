# Fase 7: Segurança de Aplicação (Container Kali Pentest)

- **Data**: 2026-10-03
- **Branch**: `feature/transparency-page-redesign`
- **Ambiente de Ataque**: Container Docker `kali-pentest:latest`
- **Alvo Autorizado**: `http://127.0.0.1:5136` (Processo Express isolado local)
- **Estado do Gate G7**: `VERIFICADO`

---

## 1. Escopo e Metodologia de Auditoria

A superfície completa do sistema de transparência (`/api/transparency/*` e `/api/admin/transparency/*`) e seus componentes associados foi submetida a teste dinâmico de intrusão automatizado (DAST) em container oficial Kali Linux (`kali-pentest:latest`).

- **Guarda Ativa de Proteção**: O script `tests/security/kali_transparency_full_pentest.py` possui guarda estrita contra execuções direcionadas a `blockminer.space` ou `dev.blockminer.space`.
- **Payloads Controlados**: Testes de injeção, fuzzing de parâmetros, elevação de privilégio, enumeração e bypass de autenticação sem impacto destrutivo.

---

## 2. Matriz de Testes de Segurança OWASP e Resultados

| # | Categoria / Vetor | Teste Executado | Resultado | Severidade |
|---|---|---|---|---|
| **1** | **Autenticação (Admin)** | `GET /api/admin/transparency` sem token | ✅ `401 Unauthorized` | Info |
| **2** | **Autenticação (Wallets)** | `GET /api/admin/transparency/tracked-wallets` sem token | ✅ `401 Unauthorized` | Info |
| **3** | **Autenticação (Hardware)** | `GET /api/admin/transparency/hardware-assets` sem token | ✅ `401 Unauthorized` | Info |
| **4** | **Segurança de Sessão** | Envio de JWT administrativo adulterado/falsificado | ✅ `401 Unauthorized` | Info |
| **5** | **BFLA (Leitura)** | Moderador com permissão `transparency.view` lista entradas | ✅ `200 OK` (Permitido por perfil) | Info |
| **6** | **BFLA (Criação)** | Moderador sem permissão `transparency` tenta criar entrada | ✅ `403 FORBIDDEN_PERMISSION` | Info |
| **7** | **BFLA (Edição)** | Moderador sem permissão `transparency` tenta alterar entrada | ✅ `403 FORBIDDEN_PERMISSION` | Info |
| **8** | **BFLA (Exclusão)** | Moderador sem permissão `transparency` tenta deletar entrada | ✅ `403 FORBIDDEN_PERMISSION` | Info |
| **9** | **BFLA (Carteiras)** | Moderador sem permissão `transparency` tenta cadastrar wallet | ✅ `403 FORBIDDEN_PERMISSION` | Info |
| **10** | **BFLA (Hardware)** | Moderador sem permissão `transparency` tenta cadastrar hardware | ✅ `403 FORBIDDEN_PERMISSION` | Info |
| **11** | **SQL Injection em Rota** | Injeção SQL em parâmetro de path `:id` (`1' OR '1'='1`) | ✅ `400 Bad Request` (bloqueado por int clamp) | Info |
| **12** | **XSS / Protocol Injection** | Injeção de `javascript:` no campo `imageUrl` | ✅ `400 Bad Request` (bloqueado por `isSafeHttpUrl`) | Info |
| **13** | **XSS / URI Injection** | Injeção de `data:text/html` no campo `providerUrl` | ✅ `400 Bad Request` (bloqueado por `isSafeHttpUrl`) | Info |
| **14** | **Business Logic / Validação** | Tentativa de enviar `amountUsd` negativo | ✅ `400 Bad Request` (bloqueado por Zod) | Info |
| **15** | **Business Logic / Limites** | Tentativa de cadastrar nome < 2 caracteres | ✅ `400 Bad Request` (bloqueado por Zod) | Info |
| **16** | **Mass Assignment (Create)** | Injeção de campos desconhecidos em criação de entrada | ✅ `400 Bad Request` (bloqueado por `.strict()`) | Info |
| **17** | **Mass Assignment (Update)** | Injeção de campos desconhecidos em atualização de entrada | ✅ `400 Bad Request` (bloqueado por `.strict()`) | Info |
| **18** | **Validação de Carteira EVM** | Envio de endereço EVM malformado | ✅ `400 Bad Request` (bloqueado por Zod regex) | Info |
| **19** | **Parâmetro ID Não-Numérico** | Envio de string alfanumérica em `:id` | ✅ `400 Bad Request` | Info |
| **20** | **Parâmetro ID Negativo** | Envio de ID `-1` em rota REST | ✅ `400 Bad Request` | Info |
| **21** | **Overflow de Inteiro (32-bit)** | Envio de ID `999999999999` acima de 32 bits | ✅ `400 Bad Request` | Info |
| **22** | **Information Disclosure** | Fuzzing de rota 404 em busca de stack trace ou segredos | ✅ `PASS` (zero vazamento de ORM ou env vars) | Info |

**Total de Verificações de Segurança**: 22 executadas, 22 aprovadas, 0 vulnerabilidades.

---

## 3. Auditoria de Dependências (`npm audit`)

Executado `npm audit --audit-level=high`:
- **Vulnerabilidades Críticas**: **0** (Zero vulnerabilidades críticas em produção).
- **Advisories Não-Críticos**: 13 advisories residuais de dependências de ferramentas e devDependencies (`prisma` dev deps, `multer`, `mysql2`), fora da superfície de transparência.

---

## 4. Evidências de Execução

```text
EVIDÊNCIA-ID: EV-SEC-0001
Estado: VERIFICADO
Comando: bash tests/security/run-kali-transparency-full-audit.sh
Ambiente: local (container kali-pentest:latest -> 127.0.0.1:5136)
Resultado: 22 testes de segurança executados, 22 PASS, 0 FAIL. BFLA, SQLi, XSS, Mass Assignment e Information Disclosure plenamente mitigados.
Arquivos: tests/security/kali_transparency_full_pentest.py, tests/security/run-kali-transparency-full-audit.sh
Conclusão: Superfície do sistema de transparência validada com rigor e em total conformidade com OWASP Top 10 API Security.
```

---

## 5. Conclusão do Gate G7

- [x] Pentest executado a partir de container Kali Linux oficial.
- [x] Scripts versionados em `tests/integration/security/` (symlink para `tests/security`).
- [x] Alvo estrito `localhost` protegido por guarda de ambiente.
- [x] Vetores de auth, BFLA, mass assignment, injection, business logic e disclosure cobertos.
- [x] Zero credenciais ou tokens expostos nos relatórios.
- [x] Estado do Gate G7: `VERIFICADO`.
