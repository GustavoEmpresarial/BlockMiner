# Fase 1 — Saneamento

Nenhum arquivo foi apagado.

O `|| true` do curl não é um arquivo. É a linha que faz o script seguir com o app parado. Sai na fase 3, junto com a troca de `/health` por `/health/ready`.

A ordem da migration (`compose run` antes do `up -d --force-recreate`) permanece. O `|| true` da migration já tinha saído num lote anterior e não volta.

## V2.50

- Fase: 1
- Estado: VERIFICADO
- Mudanças: nenhuma exclusão.
- Evidências: `git status` sem deleção. A linha do curl ainda existia no início desta fase.
- Pendências: nenhuma exclusão em REQUER_APROVACAO.
- Commit: doc desta fase.
