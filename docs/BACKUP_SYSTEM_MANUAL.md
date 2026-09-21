# Manual Técnico e Operacional do Sistema de Backups & Sincronização em Nuvem (Google Drive)

---

## 1. Visão Geral da Arquitetura

O sistema de backups do **BlockMiner** implementa uma estratégia de alta confiabilidade para **Disaster Recovery (DR)**, garantindo a salvaguarda de:
1. **Dados Relacionais do PostgreSQL:** Dump lógico completo em formato plain-text (`.sql`) gerado via `pg_dump` sanitizado.
2. **Metadados e Trilha de Integridade:** Arquivo JSON com informações de execução, auditoria de contagem de linhas e hash SHA-256 (`.meta.json`).
3. **Snapshot de Configuração do Sistema:** Arquivo compactado (`.bundle.tar.gz`) contendo `.env`, schemas Prisma, diretório de uploads e scripts operacionais.
4. **Sincronização em Nuvem:** Envio automatizado e sob demanda para o Google Drive institucional (Drive REST API v3).

---

## 2. Estrutura de Arquivos e Armazenamento

Todos os artefatos de backup são mantidos localmente no diretório persistente definido por `getAdminBackupsDirectory()` (por padrão `storage/backups/`, ou sobrescrito via variável de ambiente `BACKUP_DIR`).

| Extensão | Finalidade | Descrição |
| :--- | :--- | :--- |
| `backup-<timestamp>.sql` | Dump PostgreSQL | Plain text SQL contendo DDL e comandos `COPY public.<tabela>` com os dados. |
| `backup-<timestamp>.meta.json` | Manifesto | Metadados de criação, duração, tamanho, SHA-256, relatório de integridade e Drive file ID. |
| `backup-<timestamp>.bundle.tar.gz` | Snapshot de Configuração | Pacote `.tar.gz` compactado com arquivos críticos de configuração e mídia. |
| `.gdrive-config.json` | Configuração da Nuvem | Persistência do `refreshToken`, `folderId` e carimbo de última sincronização. |

### Exemplo de Manifesto (`.meta.json`):
```json
{
  "version": 1,
  "filename": "backup-2026-09-21T16-00-00-000Z.sql",
  "createdAt": "2026-09-21T16:00:00.000Z",
  "status": "success",
  "sizeBytes": 1048576,
  "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "integrityStatus": "valid",
  "lastVerifiedAt": "2026-09-21T16:00:05.000Z",
  "integrityReport": {
    "status": "valid",
    "verifiedAt": "2026-09-21T16:00:05.000Z",
    "checks": {
      "sizeOk": true,
      "headerOk": true,
      "footerOk": true,
      "criticalTablesOk": true,
      "hashMatch": true,
      "bundleOk": true
    },
    "missingCriticalTables": [],
    "errors": []
  },
  "googleDrive": {
    "uploadedAt": "2026-09-21T16:00:10.000Z",
    "folderId": "1a2b3c4d5e6f7g8h9i",
    "fileId": "9z8y7x6w5v4u3t2s1r",
    "webViewLink": "https://drive.google.com/file/d/9z8y7x6w5v4u3t2s1r/view"
  }
}
```

---

## 3. Motor de Detecção de Corrupção ("VERIFICAÇÃO RÍGIDA CONTÍNUA")

O sistema rejeita e alerta ativamente sobre qualquer dump corrompido, incompleto ou adulterado por meio do método `verifyBackupIntegrity(filename)`. A verificação audita 6 pilares:

1. **Tamanho Mínimo (`sizeOk`):** O arquivo `.sql` deve possuir no mínimo 256 bytes. Dumps menores são imediatamente marcados como corrompidos, indicando falha silenciosa do `pg_dump`.
2. **Checksum SHA-256 (`hashMatch`):** Calcula via streams o hash criptográfico SHA-256 do arquivo e compara com o valor registrado no manifesto no momento da geração. Qualquer alteração de bytes acusa corrupção imediata.
3. **Cabeçalho Canônico do PostgreSQL (`headerOk`):** O dump deve iniciar com a assinatura canônica `-- PostgreSQL database dump`.
4. **Presença Obrigatória das Tabelas Críticas (`criticalTablesOk`):** Valida a existência explícita de comandos `COPY public.<tabela>` para as 6 tabelas vitais:
   - `users`
   - `transactions`
   - `user_vault`
   - `user_owned_machines`
   - `miners`
   - `internal_offerwall_offers`
5. **Rodapé de Finalização (`footerOk`):** Lê os últimos 8KB do dump em tempo constante para garantir a presença do marcador `-- PostgreSQL database dump complete`. Caso a conexão tenha caído durante a geração, a ausência deste marcador acusa dump truncado.
6. **Integridade de Snapshot Bundle (`bundleOk`):** Caso exista o arquivo `.bundle.tar.gz`, executa `tar -tzf` em subprocesso estrito para certificar que o arquivo compactado não possui blocos corrompidos.

---

## 4. Integração com Google Drive (Drive REST API v3)

### Configuração de Credenciais OAuth 2.0 (.env)
- **GOOGLE_DRIVE_CLIENT_ID:** `<google-oauth-client-id>.apps.googleusercontent.com`
- **GOOGLE_DRIVE_CLIENT_SECRET:** `<google-oauth-client-secret>`
- **GOOGLE_DRIVE_PROJECT_ID:** `<google-cloud-project-id>`
- **GOOGLE_DRIVE_REDIRECT_URI:** `http://localhost`
- **Escopo:** `https://www.googleapis.com/auth/drive.file`

### Fluxo de Vinculação e Autorização
1. No painel `/admin/backups`, o administrador clica em **"Conectar Google Drive"**.
2. É gerado o link oficial de consentimento do Google (`getGoogleDriveAuthUrl`).
3. O administrador autoriza a aplicação na tela do Google e recebe o código de autorização (`code`).
4. Ao colar o código no painel, o endpoint `POST /api/admin/backups/gdrive/connect` troca o código pelo `refreshToken` oficial via `https://oauth2.googleapis.com/token`.
5. O `refreshToken` é persistido de forma segura em `storage/backups/.gdrive-config.json` e utilizado para renovar `access_token` dinamicamente a cada upload.

### Protocolos de Upload
- **Arquivos menores que 5MB (ex: `.meta.json`):** Upload multipart direto via `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`.
- **Arquivos maiores ou iguais a 5MB (ex: `.sql` e `.tar.gz`):** Protocolo Resumable Upload em duas etapas (iniciação de sessão + stream de dados chunked), prevenindo timeouts em dumps volumosos.
- **Validação Pós-Upload:** O hash MD5 retornado pela API Google é validado e armazenado no manifesto local.

---

## 5. Segurança, RBAC e Auditoria

### Controle de Acesso Baseado em Papéis (RBAC)
Todas as rotas sob `/api/admin/backups` exigem estritamente a permissão **`config`** ou **`*`** (Super Admin):
```ts
backupsAdminRouter.use(requireAdminPermission("config"));
```
Usuários sem essa permissão recebem `403 Forbidden` com código `FORBIDDEN_PERMISSION`.

### Proteção Anti-Path-Traversal
Todos os parâmetros de arquivo passam por `safeBackupSqlName` e `resolveBackupDownloadPath`:
- Proíbe `..`, `/`, `\` e caracteres de controle.
- Exige expressão regular estrita `^backup-.+\.sql$`.
- Valida o caminho canônico com `fs.realpath` para impedir escapes via symlinks.

### Trilha de Auditoria Imutável (`admin_audit_logs`)
Todas as ações geram registros auditáveis detalhados com IP, User-Agent e adminId:
- `BACKUP_LIST`: Consulta de histórico.
- `BACKUP_CREATE`: Criação de novo dump com tamanho, SHA-256 e duração.
- `BACKUP_VERIFY`: Execução de auditoria de integridade com diagnóstico.
- `BACKUP_DOWNLOAD`: Download de arquivo SQL com identificação do solicitante.
- `BACKUP_DOWNLOAD_BUNDLE`: Download de bundle de configuração.
- `BACKUP_DELETE`: Exclusão de arquivo de backup.
- `BACKUP_GDRIVE_CONNECT`: Vinculação de credenciais Google Drive.
- `BACKUP_GDRIVE_UPLOAD`: Sincronização em nuvem com fileId retornado.

---

## 6. Procedimento Operacional de Disaster Recovery (Restore)

### Restauração do Banco de Dados PostgreSQL
Para restaurar um dump `.sql` na instância PostgreSQL de produção:

```bash
# 1. Conectar ao servidor ou container PostgreSQL
# 2. Executar a restauração via psql utilizando transação única (opcional para atomicidade):
psql "$DATABASE_URL" -f /caminho/para/storage/backups/backup-2026-09-21T16-00-00-000Z.sql
```

Caso queira restaurar limpando esquemas anteriores:
```bash
# Dropar e recriar schema público (CUIDADO: ação destrutiva irreversível)
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
psql "$DATABASE_URL" -f /caminho/para/storage/backups/backup-2026-09-21T16-00-00-000Z.sql
```

### Restauração do Snapshot de Configuração (.tar.gz)
```bash
# Extrair arquivos de snapshot preservando permissões
tar -xzf backup-2026-09-21T16-00-00-000Z.bundle.tar.gz -C /app/
```
