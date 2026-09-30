# Documentação Técnica: Sinais de Fraude & Multi-Contas (`/admin/fraud-signals`)

## 1. Visão Geral e Arquitetura do Domínio

O módulo de Sinais de Fraude (`/admin/fraud-signals`) é a ferramenta de inteligência forense e detecção de multi-contas do BlockMiner 2.1.
Enquanto o motor AntiBot analisa anomalias comportamentais e scripts em sessões individuais de jogadores, o módulo de Sinais de Fraude realiza correlação analítica entre múltiplas contas para identificar:
- **Colisão de Carteiras On-Chain (`wallet`):** Múltiplas contas vinculadas ao mesmo endereço público EVM/Polygon.
- **Colisão de Endereços IP (`registration_ip`, `last_ip`, `ip_log`):** Múltiplas contas criadas sob o mesmo IP residencial ou corporativo, com histórico em `ip_logs` e enriquecimento de ASN/PTR/Proxy via `ip-intelligence`.
- **Colisão de Dispositivos (`device_fingerprint`):** Mapeamento de instâncias onde diferentes contas compartilham a mesma assinatura digital de hardware e canvas.

### Motor de Avaliação de Risco de Multi-Contas (`admin.multi-account-risk.ts`)

O motor de risco aplica um modelo heurístico estrito (sem I/O, puro) sobre cada cluster:
- **Isolamento de Infraestrutura:** IPs locais, redes privadas e proxies Docker são automaticamente neutralizados (`infrastructure_ignored`, score 0), prevenindo falsos positivos causados pelo roteamento interno do Nginx.
- **Identidade e Vetores de Correlação:** Carteira on-chain e fingerprint de dispositivo atuam como vetores fortes de identidade. IP compartilhado atua como sinal fraco e requer corroboração adicional.
- **Grau de Confiança & Recomendações:** Classifica em `low`, `medium`, `high` e `critical`, com cálculo de confiança e recomendação de mitigação (`monitor`, `manual_review`, `restrict_withdrawals`, `suspend_accounts`).

### Fluxo Arquitetural

```mermaid
flowchart TD
    Client[Operador Admin] -->|Acessa UI /admin/fraud-signals| UI["AdminFraudSignalsPage.tsx"]
    UI -->|adminFraudSignalsApi| Router["fraudSignalsAdminRouter"]
    Router -->|requireAdminAuth| Auth["JWT HS256 Validation"]
    Router -->|RBAC Guard| RBAC["requireAdminPermission('fraud_signals.view' | 'fraud_signals')"]
    Router -->|Distributed Rate Limiter| DRL["120 read / 60 write / 5 reset per hour"]
    Router -->|Zod .strict()| Zod["admin.fraud-signals.schemas.ts"]
    Router --> Service["admin.fraud-signals.service.ts"]
    
    Service --> Postgres[(PostgreSQL: users, ip_logs)]
    Service --> Cache[(PostgreSQL: ip_intelligence_cache)]
    Service --> RiskEngine["admin.multi-account-risk.ts"]
    
    Router -->|logAdminAction| AuditDB[(PostgreSQL: admin_audit_logs)]
```

---

## 2. Modelos de Dados Envolvidos

### users (`users`)
Armazena identificadores de carteira e IPs principais:
- `wallet_address`: Endereço da carteira EVM (com índice de unicidade `users_wallet_address_key`).
- `registration_ip`: Endereço IP capturado no momento do cadastro.
- `ip`: Último IP registrado de sessão.
- `user_agent`: String do agente do navegador.

### ip_logs (`UserIpLog`)
Histórico contínuo de acessos por sessão:
- `user_id`: Identificador do usuário relacionado.
- `ip`: IP registrado na conexão.
- `device_fingerprint`: Hash identificador do dispositivo.
- `created_at`: Data e hora da conexão.

### ip_intelligence_cache (`IpIntelligenceCache`)
Cache local persistido de lookups ASN e proxies:
- `ip`: Endereço IP normalizado.
- `asn`: Número de sistema autônomo (BGP ASN).
- `asn_org`: Provedor de Internet (ISP / Datacenter).
- `proxy_detected`: Booleano indicando detecção de VPN/Proxy/Tor.
- `proxy_type`: Tipo de proxy classificado.
- `expires_at`: Data de expiração do cache.

---

## 3. Matriz de Permissões RBAC e Rate Limiting

| Método | Endpoint | Permissões Requeridas | Rate Limit | Auditoria Registrada |
|---|---|---|---|---|
| `GET` | `/api/admin/fraud-signals` | `fraud_signals.view` ou `fraud_signals` | 120 req/min | — |
| `POST` | `/api/admin/fraud-signals/refresh-ip` | `fraud_signals` | 60 req/min | `ADMIN_FRAUD_REFRESH_IP` |
| `POST` | `/api/admin/fraud-signals/reset-collection` | `fraud_signals` | 5 req/hora | `ADMIN_FRAUD_RESET_COLLECTION` |

---

## 4. Especificação OpenAPI 3.0.3

```yaml
openapi: 3.0.3
info:
  title: BlockMiner 2.1 - Fraud Signals & Multi-Account Intelligence API
  version: 2.1.0
  description: API administrativa para investigação forense de multi-contas, correlação de clusters por carteira, IP e dispositivo.
paths:
  /api/admin/fraud-signals:
    get:
      summary: Listar clusters de sinais de fraude
      description: Retorna clusters agrupados e pontuados pelo motor de risco de multi-contas.
      security:
        - AdminJwtAuth: []
      parameters:
        - in: query
          name: scope
          schema:
            type: string
            enum: [all, wallets, ips, devices]
            default: all
          description: Escopo de agrupamento dos sinais de fraude
        - in: query
          name: page
          schema:
            type: integer
            default: 1
            minimum: 1
          description: Número da página
        - in: query
          name: limit
          schema:
            type: integer
            default: 40
            minimum: 1
            maximum: 100
          description: Quantidade máxima de clusters por página
        - in: query
          name: q
          schema:
            type: string
            maxLength: 120
          description: Termo de busca opcional (IP, carteira, username, e-mail)
      responses:
        '200':
          description: Lista de clusters e metadados retornados com sucesso.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/FraudSignalsResponse'
        '400':
          description: Parâmetros de consulta inválidos.
        '401':
          description: Não autenticado.
        '403':
          description: Permissão insuficiente (exige fraud_signals.view ou fraud_signals).
        '429':
          description: Limite de requisições excedido.

  /api/admin/fraud-signals/refresh-ip:
    post:
      summary: Forçar atualização de inteligência para um IP
      description: Dispara consulta ao vivo aos provedores de ASN/PTR/Proxy para um endereço IP específico.
      security:
        - AdminJwtAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - ip
              properties:
                ip:
                  type: string
                  minLength: 3
                  maxLength: 60
                forceRefresh:
                  type: boolean
                  default: true
              additionalProperties: false
      responses:
        '200':
          description: Inteligência de rede atualizada com sucesso.
        '400':
          description: IP inválido ou body malformado.
        '403':
          description: Permissão insuficiente (exige fraud_signals).

  /api/admin/fraud-signals/reset-collection:
    post:
      summary: Limpar base de coleta de histórico de fraudes
      description: Ação administrativa destrutiva que limpa registros de ip_logs, cache de inteligência e IPs dos perfis de usuário.
      security:
        - AdminJwtAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - confirm
              properties:
                confirm:
                  type: string
                  example: RESET_FRAUD_COLLECTION
              additionalProperties: false
      responses:
        '200':
          description: Base de coleta limpa com sucesso.
        '400':
          description: Frase de confirmação incorreta.
        '403':
          description: Permissão insuficiente (exige fraud_signals).

components:
  securitySchemes:
    AdminJwtAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:
    FraudSignalsResponse:
      type: object
      properties:
        ok:
          type: boolean
        scope:
          type: string
          enum: [all, wallets, ips, devices]
        page:
          type: integer
        limit:
          type: integer
        total:
          type: integer
        signalCount:
          type: integer
        signals:
          type: array
          items:
            $ref: '#/components/schemas/FraudClusterItem'
        generatedAt:
          type: string
          format: date-time
        note:
          type: string

    FraudClusterItem:
      type: object
      properties:
        id:
          type: string
        kind:
          type: string
        signalType:
          type: string
        key:
          type: string
        userCount:
          type: integer
        users:
          type: array
          items:
            $ref: '#/components/schemas/FraudClusterUser'
        riskScore:
          type: integer
          minimum: 0
          maximum: 100
        riskLevel:
          type: string
          enum: [low, medium, high, critical]
        confidence:
          type: string
          enum: [low, medium, high]
        reasons:
          type: array
          items:
            type: string
        falsePositiveWarnings:
          type: array
          items:
            type: string
        identityVectors:
          type: array
          items:
            type: string
        decision:
          type: object
          properties:
            confidence:
              type: string
            recommendedAction:
              type: string
            destructiveAllowed:
              type: boolean
            reason:
              type: string
            requiresManualReview:
              type: boolean

    FraudClusterUser:
      type: object
      properties:
        id:
          type: integer
        username:
          type: string
          nullable: true
        email:
          type: string
        walletAddress:
          type: string
          nullable: true
        createdAt:
          type: string
          format: date-time
        lastLoginAt:
          type: string
          format: date-time
          nullable: true
```
