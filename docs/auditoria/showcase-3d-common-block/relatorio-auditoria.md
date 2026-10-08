# Relatório — bloquear miner 3D nas salas comuns (Etapa A)

Base: `b423ad1`. Branch: `feature/showcase-3d-common-block`. Worktree: `/home/gustavo/Documentos/BlockMiner2.1/showcase-3d-common-block`. Sem push. Sem deploy.

## O que entrou

1. **Bloqueio na volta** em `resolveInstallMinerContext`: `if (showcase) { … } else if (isShowcase3dMiner(showcaseMinerFromInventory(item)))` → `SHOWCASE_3D_FITS_ONLY`.
2. **Mesma função** `isShowcase3dMiner` (GLB `/media/models/*.glb`, nome `MinerCore MCX9`, ou image `/minercore-mcx9`).
3. **i18n** pt-BR / en / es (`errors.SHOWCASE_3D_FITS_ONLY` + toast `inventory.showcase_3d_fits_only`).
4. **Client** pré-checa com `rackMinerModelUrl` antes do POST.
5. **Etapa A** script somente leitura: `scripts/audit/count-showcase-3d-in-common-rooms.mts`.

## Etapa B — plano (NÃO implementada)

Só depois que o dono autorizar com o número na mão.

- **Caminho:** reutilizar `moveRackMinerBackToInventoryTx` (o mesmo uninstall das salas 1–4). Se algum caso (ex.: ownedMachine/event sem linha esperada) fizer essa função falhar, **parar e perguntar** — máquina nenhuma pode sumir.
- **Granularidade:** transação **por máquina** (um `$transaction` por rack afetado), em loop por usuário. Falha numa máquina não deixa as outras pela metade sem registro; já desfeitas ficam no inventário.
- **Idempotência:** só age em racks com `userMiner` 3D ainda nas salas 1–`ROOM_MAX`. Segunda execução encontra zero alvos. Não cria inventário duplicado porque o rack fica vazio após a primeira.
- **Auditoria:** gravar `audit_logs` (ou equivalente já usado no módulo) com `userId`, `rackId`, `userMinerId`/hashRate, código da migração, timestamp. Lista JSON de IDs processados no stdout.
- **Reversão:** não automática. Reverter = o usuário reinstala na Sala 3D (ou admin reinstala manualmente a partir do inventário). O script da Etapa B **não** apaga a máquina; só move rack → inventário. Snapshot pré-migração (saída da Etapa A + log da B) permite conferência.

## Contagem Etapa A (localhost)

Script testado contra banco local (`127.0.0.1` / `blockminer`). **Produção não foi consultada.**

Prova com fixture (depois apagada):

| métrica | valor |
|---|---|
| máquinas 3D em salas 1–4 | 5 |
| usuários distintos | 3 |
| hashrate total | 375 |
| pior conta | 3 máquinas / 300 hashrate |

Baseline local após limpeza do fixture:

| métrica | valor |
|---|---|
| máquinas 3D em salas 1–4 | 0 |
| usuários distintos | 0 |
| hashrate total | 0 |

### Como rodar (humano)

```bash
cd /home/gustavo/Documentos/BlockMiner2.1/showcase-3d-common-block
# LOCAL (já testado):
npx tsx --import ./tests/_env-test-overrides.mjs scripts/audit/count-showcase-3d-in-common-rooms.mts

# DUMP local de produção (humano): apontar DATABASE_URL só para um dump em 127.0.0.1
# Nunca blockminer-db / IPs de produção. O script recusa esses alvos.
DATABASE_URL='postgresql://…@127.0.0.1:5432/NOME_DO_DUMP' \
  npx tsx --import ./tests/_env-test-overrides.mjs scripts/audit/count-showcase-3d-in-common-rooms.mts
```

## Verificação localhost

- Conta semeada ≠ 294, login real (Playwright), sem token forjado.
- `installMinerForUser` sala 1 + MinerCore MCX9 → `SHOWCASE_3D_FITS_ONLY`, inventário intacto.
- Mesma miner na sala 101 → install ok.
- Login → `/inventory` ok.

## Gates (comandos rodados)

| gate | resultado |
|---|---|
| `tests/rooms/**` | 52 pass / 0 fail |
| client vitest | 132 files / 1111 tests |
| client typecheck | 61 erros (baseline) |
| client `vite build` | EXIT 0 |

## Resumo V2.50

- Fases 0–8: concluídas neste lote (Etapa A + bloqueio; sem Etapa B escrita).
- Risco restante: números de produção ainda desconhecidos até o humano rodar o script num dump.
- Próximo passo humano: rodar contagem no dump → dono decide → autorizar Etapa B.
EOF