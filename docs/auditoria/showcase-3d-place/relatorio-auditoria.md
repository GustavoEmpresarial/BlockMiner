# Relatório — instalar e guardar o rack da Sala 3D

Branch `feature/showcase-3d-place-remove`. Sem deploy. Sem push. `.env.production` intocado. Conta 294 não foi usada.

## O que mudou

O rack comprado na Loja ou nas Ofertas fica guardado (`user_visual_rack_placements.floor_slot` nulo). Esse registro é o crédito. Não é `users.rack_credits`.

Piso vazio com crédito: botão Instalar rack, consome esse crédito (preenche o piso). Piso vazio sem crédito: o texto de comprar na Loja ou nas Ofertas, sem botão. Rack ocupado: Tirar o rack da sala, devolve o mesmo crédito. Arrastar de um piso para outro continua `SHOWCASE_RACK_FIXED`. `fromCredit` na sala 3D também.

## Máquina

Segue as salas 1–4. Desmontar chama `moveRackMinerBackToInventoryTx` em `server/modules/rooms/rooms.service.ts`: a máquina volta para `user_inventory` e o `userMiner` é apagado. Se a baia ainda tem máquina, guardar responde `RACK_NOT_EMPTY` e não apaga nada.

## Flag

Com `SHOWCASE_3D_ROOM_ENABLED=1`, a allowlist não filtra. A sala nasce com `pricePaid: 0` e zero racks. Não mexe em `rack_credits`. Ligar isso em produção é deploy. Não foi feito.

## Aviso

Card e modal, loja e ofertas, três idiomas: "Só pode ser instalada na Sala 3D." Só para máquina 3D (`isShowcase3dCatalogMachine`). A regra `SHOWCASE_3D_ONLY` não mudou. O MinerCore MCX9 está nas ofertas, não na grade da loja. A loja não tem coluna `modelUrl`.

## Antes e depois

Antes: a compra já escolhia o piso, a sala não deixava guardar, e o piso vazio só mandava comprar. Depois: a compra guarda o crédito, a sala instala e devolve o crédito, e a máquina volta ao inventário.

## Tela (localhost)

API `127.0.0.1:3031` com a flag ligada e allowlist só no usuário 1. Vite `127.0.0.1:5191`. Login real pela tela, conta semeada 10504, fora da allowlist.

- A sala 3D apareceu.
- Compra na loja: toast de rack para instalar, saldo de crédito 1, `rack_credits` de prateleira não entrou nesse fluxo.
- Instalar: o rack apareceu, o botão de tirar apareceu, os outros pisos voltaram ao texto de compra. Toast "RACK COLOCADO."
- Máquina MinerCore MCX9 no rack. Desmontar: toast de máquinas no inventário, a imagem `[Event] MinerCore MCX9` ficou na mochila, o crédito voltou para "1 rack(s) para instalar".
- Instalar de novo: o rack voltou, o crédito sumiu, a máquina continuou na mochila. Toast "RACK COLOCADO."
- Ofertas, card e modal de pagamento: `note` "Só pode ser instalada na Sala 3D."

`maestri portal screenshot` estourou o tempo ("page is not rendering"). O texto foi lido da árvore de acessibilidade.

## Testes

Integração de compra: 8 passou. Integração de place: 4 passou. Testes de cliente tocados: 52 passou. Suíte do client: 1109 passou e 1 flake de torneio que passou sozinho. Typecheck do client: 61, a linha de base. `vite build`: saiu 0.

## Risco que ficou

- k6 não rodou. Kali não rodou.
- A flag em produção não foi ligada.
- Mover o rack arrastando continua bloqueado de propósito. Trocar de piso é guardar e instalar.
- O aviso na grade da loja só aparece se o item tiver `modelUrl` `.glb`. Hoje o MCX9 é oferta.

## Resumo V2.50

- Fase: 8
- Estado: VERIFICADO
- Mudanças: este relatório
- Evidências: fluxo na tela descrito acima; testes da fase 5
- Pendências: screenshot do portal falhou; deploy da flag não é deste agente
- Commit: este commit
