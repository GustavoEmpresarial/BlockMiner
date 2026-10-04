# Fase 0 — Reconhecimento e Baseline do Redesign da Página /dashboard

**Data**: 04/10/2026  
**Responsável**: Executor (Antigravity / Gemini 3.8 Flash High)  
**Ambiente**: Localhost (127.0.0.1)  
**Branch de Trabalho**: `feature/dashboard-page-redesign` (criada a partir de `develop` commit `f4a5872`)

---

## 1. Identificação de Ambiente e Isolamento Git

- **Branch Base**: `develop` no commit `f4a5872` (`docs(auditoria): fase 9 relatorio de deploy do redesign de transparencia`).
- **Branch Ativa**: `feature/dashboard-page-redesign`.
- **Status do Git Inicial**: Árvore de trabalho limpa para arquivos rastreados (arquivos untracked preservados: `.maestri/`, imagens e symlinks de teste `tests/integration/` e `tests/load`).
- **Target de Banco de Testes**:
  - PostgreSQL de teste: `127.0.0.1:5442` (container `blockminer-current-db`, saudável).
  - Redis de teste: `127.0.0.1:6389` (container `blockminer-current-redis`, saudável).
  - Banco de Produção: `blockminer-db` — estritamente intocado e protegido por barreira.
  - Alvo de testes e ferramentas: `localhost` exclusivamente. Staging foi desativado em 04/10/2026 e não existe neste canvas.

---

## 2. Comandos Reais dos package.json

### Raiz (`package.json`)
- `build`: `tsc -p tsconfig.json`
- `typecheck`: `tsc --noEmit -p tsconfig.json`
- `dev`: `tsx watch server/bootstrap/server.ts`
- `start`: `node dist/server/bootstrap/server.js`
- `test`: `tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit --experimental-test-module-mocks tests/**/*.test.mjs`
- `test:coverage`: `tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit --experimental-test-module-mocks --experimental-test-coverage tests/**/*.test.mjs`

### Cliente (`client/package.json`)
- `build`: `vite build`
- `typecheck`: `tsc --noEmit -p tsconfig.json`
- `dev`: `vite`
- `test`: `vitest run`
- `test:watch`: `vitest`
- `lint`: `eslint .`
- `smoke`: `node scripts/smoke-client.mjs`

---

## 3. Baseline Pré-existente Registrado

Antes de qualquer edição em arquivos do projeto, o baseline de testes e typecheck foi catalogado dinamicamente:

### 3.1 Testes da Feature `/dashboard`
- **Comando**: `npx vitest run features/dashboard` (no diretório `client`)
- **Resultado**: 12 arquivos de teste executados, **187 testes passando**, 0 falhas, 0 skips.
- **Duração**: 6.20s.

### 3.2 Suíte Global Backend
- **Comando**: `npm test` (na raiz do projeto)
- **Resultado**: 2386 testes executados, **2350 passaram**, **35 falhas pré-existentes**, 1 skipped.
- **Causa das 35 falhas**: divergências pré-existentes de seed/dados no banco de teste local (`blockminer-current-db`).

### 3.3 Typecheck Server
- **Comando**: `npm run typecheck` (na raiz)
- **Resultado**: **74 erros pré-existentes** catalogados (módulos auth, games, mining, rooms, shortlinks, wallet).

### 3.4 Typecheck Client
- **Comando**: `npm run typecheck` (no diretório `client`)
- **Resultado**: **67 erros pré-existentes** catalogados (nenhum erro de compilação nos arquivos funcionais de `features/dashboard`; apenas 1 erro em `DashboardEnergyTaxModal.test.tsx` referente a mock de propriedade, componente intocado).

---

## 4. Superfície Mapeada da Feature `/dashboard`

- **Página Principal**: `client/src/features/dashboard/DashboardPage.tsx` (531 linhas).
- **Componentes**:
  - `client/src/features/dashboard/components/dashboard.parts.tsx` (555 linhas): `DashboardCards`, `DashboardHistory`, `DashboardEfficiencyCard`, `DashboardActivityCard`.
  - `client/src/features/dashboard/components/MiningAllocationPanel.tsx` (382 linhas): painel de alocação de poder de mineração.
  - `client/src/features/dashboard/components/DashboardEnergyTaxModal.tsx` (373 linhas): **INTOCADO**, em produção com portal.
  - `client/src/features/dashboard/components/DashboardBannersCarousel.tsx` (342 linhas): carrossel de banners com timer.
- **Bibliotecas / Helpers**:
  - `client/src/features/dashboard/lib/dashboard.api.ts`
  - `client/src/features/dashboard/lib/dashboard.helpers.ts`
  - `client/src/features/dashboard/lib/dashboard.errors.ts`
  - `client/src/features/dashboard/lib/dashboard.config.ts`
  - `client/src/features/dashboard/lib/useDashboardPoll.ts`
  - `client/src/features/dashboard/lib/miningSocket.types.ts`
  - `client/src/features/dashboard/lib/dashboardBalanceCurrency.ts`
  - `client/src/features/dashboard/lib/dashboardCoinLogos.ts`
  - `client/src/features/dashboard/lib/shared.ts`
- **Internacionalização (i18n)**:
  - Chave raiz `dashboard` com 103 chaves em `client/src/i18n/locales/{pt-BR,en,es}.json`.

---

## 5. Problemas Concretos Mapeados para Resolução

1. **P1 — Badge "SINCRONIZADO" estático e falso**:
   - `DashboardPage.tsx:309-313`: renderiza ícone de Wifi verde e texto `t('dashboard.synced')` sem qualquer leitura de estado de rede/polling.
   - Solução: Conectar ao estado real do `useDashboardPoll` (estados: conectado/sincronizado, atualizando, reconectando/erro) com `aria-live="polite"`.
2. **P2 — Localização em Espanhol (es.json)**:
   - 85 das 103 chaves estão com valores em inglês (ex.: welcome, balance, speed, history_title, etc.).
   - Solução: Traduzir prosa legítima para espanhol autêntico, mantendo idênticos apenas marcas e termos técnicos universais, documentando contagem exata.
3. **P3 — Armadilha de Containing Block na Raiz**:
   - `DashboardPage.tsx:299`: container raiz possui `space-y-10 animate-in fade-in duration-700`. Cria stacking context e quebra componentes com `position: fixed`.
   - Solução: Mover a animação para o conteúdo interno que não afeta fixed elements, mantendo o container pai neutro e documentado.
4. **P4 — Escala Inconsistente de Raios (Border Radius)**:
   - Dispersão: `rounded-xl` (23), `rounded-2xl` (18), `rounded-full` (17), `rounded-3xl` (5), `rounded-lg` (4), `rounded-md` (2), `rounded-[2rem]` (1).
   - Solução: Padronizar em escala coerente: `rounded-2xl` para cards principais, `rounded-xl` para subcards/inputs, `rounded-lg` para botões/pills pequenos, `rounded-full` para badges circulares e avatares.
5. **P5 — Contraste WCAG AA**:
   - 24 ocorrências de `text-gray-500`, `text-gray-600` e `text-gray-700` em textos de apoio sobre fundos escuros (`slate-900`/`slate-950`).
   - Solução: Ajustar para `text-slate-400` / `text-slate-300`, garantindo ratio $\ge 4.5:1$.

---

## 6. Evidências da Fase 0

```text
EVIDÊNCIA-ID: EV-0001
Estado: VERIFICADO
Comando: git checkout -b feature/dashboard-page-redesign
Ambiente: local
Resultado: Branch feature/dashboard-page-redesign criada a partir de develop (f4a5872)
Arquivos: N/A
Conclusão: Isolamento git estabelecido antes de qualquer modificação de código.

EVIDÊNCIA-ID: EV-0002
Estado: VERIFICADO
Comando: npx vitest run features/dashboard
Ambiente: local
Resultado: 12 arquivos de teste, 187 testes passando, 0 falhas
Arquivos: client/src/features/dashboard/**/*
Conclusão: Base de testes da feature 100% verde antes de alterações.

EVIDÊNCIA-ID: EV-0003
Estado: VERIFICADO
Comando: npm run typecheck (client) && npm run typecheck (server)
Ambiente: local
Resultado: 67 erros no client (0 em dashboard funcional, 1 em teste do modal intocado) e 74 no server
Arquivos: Vários módulos
Conclusão: Baselines de typecheck confirmados e classificados como pré-existentes.
```

---

## 7. Critérios do Gate da Fase 0

- [x] Branch criada antes de editar.
- [x] Árvore inicial do Git e status documentados.
- [x] Comandos reais do package.json verificados.
- [x] Banco de testes e Redis locais identificados (`127.0.0.1:5442`, `127.0.0.1:6389`).
- [x] Nenhuma conexão com banco de produção (`blockminer-db`).
- [x] Falhas e erros pré-existentes catalogados e diferenciados.
- [x] 187 testes da feature confirmados verdes.
- [x] Orquestrador informado via `maestri ask`.
