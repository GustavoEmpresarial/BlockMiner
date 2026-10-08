# Fase 7 — Segurança

O container `kali-pentest` não foi executado. A API local usada na tela estava com o segredo do Turnstile vazio só no processo, para o formulário real aceitar o login. Esse processo é encerrado no fim. Não representa produção. Não houve payload.

O que o código e os testes de regressão cobrem, sem Kali:

- Auth: instalar e guardar passam pelo serviço de salas já autenticado. Sem token forjado.
- Horizontal: o place usa o `userId` da sessão e a sala desse usuário.
- Crédito: lock `pg_advisory_xact_lock(userId, 101)` na compra e no place. Dois cliques no mesmo crédito deixam um rack. Guardar duas vezes não cria o segundo crédito.
- Mass assignment de prateleira: `fromCredit` na sala 3D responde `SHOWCASE_RACK_FIXED`.
- Máquina: guardar com baia ocupada responde `RACK_NOT_EMPTY`. Desinstalar devolve o inventário.
- A flag ligada não concede rack.

Achado crítico ou alto: nenhum novo. O aviso da loja é texto; a recusa `SHOWCASE_3D_ONLY` continua no servidor.

## Resumo V2.50

- Fase: 7
- Estado: OBSERVADO
- Mudanças: nenhuma varredura Kali
- Evidências: `rooms.showcasePlace.integration.test.mjs` (lock, baia ocupada, flag sem rack)
- Pendências: Kali não rodou
- Commit: este commit
