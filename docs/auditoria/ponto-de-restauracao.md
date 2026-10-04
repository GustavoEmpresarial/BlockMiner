# Ponto de Restauração — Pré-Redesign Visual MiningHash

- **Data**: 2026-10-04
- **Finalidade**: Ponto de restauração seguro e imutável antes do início do redesign visual amplo (55 páginas de usuário baseadas no layout do mininghash.net).
- **Ambiente de Produção**: Host `169.58.45.155` (VM IBM Cloud)
- **Commit do Ponto de Restauração**: `ff8092a865e7df5230ceba77002e131ae14ed417` (`ff8092a`)
- **Branch de Restauração Criada**: `restore/pre-mininghash-20261004` (publicada em `origin`)
- **Tag Anotada Criada**: `v-pre-mininghash-20261004` (publicada em `origin`)
- **Bundle Ativo em Produção**: `index-NUQ9Ui21.js` (CSS `index-CxWC0BM4.css`)
- **Healthcheck Produção**: HTTP 200 OK (`{"ok":true,"service":"blockminer"}`)

---

## 1. Estado de Produção no Momento do Ponto de Restauração

No momento da criação deste ponto de restauração, a produção encontra-se 100% operacional, saudável e sem manutenções ativas:

- **Git Ref em Produção**: `origin/main` @ `ff8092a` (Merge pull request #15 from GustavoEmpresarial/develop — *release: hotfix modal de alocacao em createPortal*)
- **Bundle SPA compilado**: `client/dist/index.html` servindo `assets/index-NUQ9Ui21.js` e `assets/index-CxWC0BM4.css`
- **Banco de Dados**: PostgreSQL em `blockminer-db` (Porta 5432, SSL verify-full, 26 migrations aplicadas)
- **Modo de Manutenção**: `SITE_MAINTENANCE=0`
- **Containers Ativos**:
  - `blockminer-current-app`: `healthy` (Up)
  - `blockminer-current-stats-materializer`: `Up`
  - `blockminer-current-phd`: `Up`
  - `blockminer-current-kafka`: `healthy` (Up)
  - `blockminer-current-redis`: `healthy` (Up)
  - `blockminer-current-nginx`: `Up`
- **Funcionalidades e Layout no Ar**: Interface padrão do BlockMiner anterior ao redesign, com modais de alocação de mineração montados via `createPortal` eliminando deslocamentos de margem.

---

## 2. Comando Exato de Rollback

Se durante ou após o redesign visual for necessário reverter a produção exatamente para este estado, o comando a ser executado a partir da raiz do repositório (`current/`) é:

```bash
./deploy.sh --ref restore/pre-mininghash-20261004
```

### Por que uma Branch e não apenas uma Tag?
No script de deploy na VM (`storage/scripts/deploy/deploy.py:388`), o processo executa:
```bash
git checkout -f -B <ref> FETCH_HEAD
```
O parâmetro `-B` cria/reseta uma **branch**. Usar um nome que colidisse apenas como tag geraria ambiguidade e falha no checkout forçado. A branch `restore/pre-mininghash-20261004` garante que o ref seja resolvido e checado diretamente como branch válida. A tag `v-pre-mininghash-20261004` foi criada em paralelo como registro imutável no histórico do repositório.

---

## 3. Teste e Validação do Mecanismo de Rollback (Localhost)

Conforme a diretriz de segurança, o ponto de restauração foi exercitado e testado em ambiente local (localhost) para comprovar a resolução e a integridade do rollback antes de qualquer alteração de código.

### Testes Executados com Sucesso:

1. **Resolução Remota no GitHub (origin)**:
   - `git ls-remote origin restore/pre-mininghash-20261004`
     - **Resultado**: `ff8092a865e7df5230ceba77002e131ae14ed417 refs/heads/restore/pre-mininghash-20261004`
   - `git ls-remote origin refs/tags/v-pre-mininghash-20261004*`
     - **Resultado**: tag `406da11...` dereferenciando para `ff8092a865e7df5230ceba77002e131ae14ed417 refs/tags/v-pre-mininghash-20261004^{}`

2. **Simulação do Fluxo de Deploy de Atualização (`deploy.py:382-390`)**:
   - Em diretório transitório isolado (`/tmp/opencode/test-rollback-vm`):
     - Simulado estado modificado / branch divergente (`feature/redesign-test` com commits à frente e arquivos untracked).
     - Executados os comandos exatos que rodam na VM:
       ```bash
       git remote set-url origin https://github.com/GustavoEmpresarial/BlockMiner.git
       git fetch --depth 1 origin restore/pre-mininghash-20261004
       git reset --hard HEAD || true
       git clean -fd --exclude=dist --exclude=client/dist --exclude=storage --exclude=.env --exclude=.env.production
       git checkout -f -B restore/pre-mininghash-20261004 FETCH_HEAD
       git reset --hard FETCH_HEAD
       git clean -fd --exclude=dist --exclude=client/dist --exclude=storage --exclude=.env --exclude=.env.production
       ```
     - **Resultado**: HEAD moveu-se com precisão para `ff8092a865e7df5230ceba77002e131ae14ed417`.
     - **Integridade da Árvore**: Branch apontando para `restore/pre-mininghash-20261004`, artefatos protegidos preservados (`client/dist/`, `dist/`, `storage/`) e arquivos soltos do teste limpos.

3. **Simulação do Fluxo de Clone Inicial (`deploy.py:357-360`)**:
   - `git clone --depth 1 --branch restore/pre-mininghash-20261004 https://github.com/GustavoEmpresarial/BlockMiner.git /tmp/opencode/test-rollback-fresh`
   - **Resultado**: Clone completado com sucesso e `git rev-parse HEAD` confirmando `ff8092a865e7df5230ceba77002e131ae14ed417`.

---

## 4. O que Ficou Sem Teste e Justificativa

Em estrito cumprimento das diretrizes de governança:

1. **Execução de SSH e comando `./deploy.sh` contra a VM de Produção (`169.58.45.155`)**:
   - **Status**: NÃO executado.
   - **Justificativa**: Esta tarefa é estritamente a criação e validação do ponto de restauração ("NAO e deploy. Nao publique nada em producao nesta tarefa"). Acionar o script contra a VM provocaria interrupção/rebuild desnecessário nos containers de produção já em operação.
2. **Ambiente Staging**:
   - **Status**: NÃO executado.
   - **Justificativa**: O ambiente de staging foi permanentemente desativado e removido do canvas em 04/10/2026.
