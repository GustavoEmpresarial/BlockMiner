# Rack da sala 3D

Branch `fix/showcase-3d-rack` a partir de `origin/main` @ `4242177`.
Worktree: `/home/gustavo/Documentos/BlockMiner2.1/fix-showcase-3d-rack`.
O checkout compartilhado não foi trocado. `.env.production` não foi editado.

## Arte

`storage/media-seed/racks/showcase-3d-rack-fit.svg` mantém `viewBox="0 0 1500 1080"`. As duas aberturas continuam retângulos chapados `#020617` em `75,129.6 1350×410.4` e `75,604.8 1350×410.4`, que são os 5%/12%/90%/38% e 5%/56%/90%/38% de `inventory2.rackLayout.ts`. Sem `<text>`, sem gradiente, sem sombra borrada.

A leitura aprovada na grade 3×2 usa a paleta redefinida do tema (`client/tailwind.config.js`): fundo da página `#0F1522`, chassi `#2A3F66`, aro `#3E547A`, postes e prateleira `#152036`, LEDs `#3D81F6`, sombra preta deslocada 24 unidades do viewBox. As três capturas da arte estão em `preview-baias.png`, `preview-grade.png` e `preview-sala.png`.

## Variantes órfãs

Nenhuma das três tem referência viva. O cliente e o servidor apontam só para `showcase-3d-rack-fit.svg` (`rooms.showcase.ts:22` e `inventory2.rackLayout.ts:5`). O comentário em `inventory2.rackLayout.ts:4` ainda cita o nome antigo `showcase-3d-rack.svg`; o arquivo que ele descreve não é o que a URL carrega.

| Arquivo | viewBox | Veredito |
|---|---|---|
| `storage/media-seed/racks/showcase-3d-rack.svg` | `0 0 800 500` | candidata a remoção |
| `storage/media-seed/racks/showcase-3d-rack-stack.svg` | `0 0 1000 1600` | candidata a remoção |
| `storage/media-seed/racks/showcase-3d-rack-wide.svg` | `0 0 1600 1000` | candidata a remoção |

Não foram apagadas. Exclusão de arquivo fica para o dono.

## A arte que o lab serviu

`seedBundledMedia` em `server/modules/media/media.seed.ts` copia o seed para `storage/uploads/media/<categoria>/` só quando o destino ainda não existe (linhas 35–38). Arquivo presente no volume fica como está.

No lab o processo subiu com cwd neste worktree. O svg do volume deste worktree foi apagado antes do boot, então o seed gravou o arquivo novo. Depois do boot, estes quatro sha256 são iguais, `3a1f12b17cb667fd4b5ee82ec7589b64d116fdeddfc2054a135450efb32d71c9`, 1876 bytes:

- `storage/media-seed/racks/showcase-3d-rack-fit.svg`
- `storage/uploads/media/racks/showcase-3d-rack-fit.svg`
- `GET http://127.0.0.1:3000/media/racks/showcase-3d-rack-fit.svg`
- o mesmo caminho pelo Vite de `127.0.0.1:5174`

O Vite de desenvolvimento deste repositório não faz proxy de `/media`. O lab usou um config só em `/tmp` para apontar `/media` ao API local. Isso não entra no commit. Em produção a origem já serve `/media`.

Num volume que já tenha o svg antigo, este seed não troca o arquivo. Trocar a arte em produção é passo de deploy, junto com a flag, e só depois que o dono aprovar a captura com máquina.

## Sala e instalação

A sala `showcase_3d`, número 101, continua grátis e fora das salas 1–4. `listRooms` só a inclui quando `SHOWCASE_3D_ROOM_ENABLED` está ligado (`rooms.dto.ts:87`). A flag default segue off em `rooms.showcase.ts`.

Um rack das salas 1–4 não entra na 101. A imagem do móvel não fica na linha do rack: a 101 nasce só em `ensureShowcaseRoomForUser` e `buyShowcaseRackForUser`, as duas com `kind: showcase_3d`. `buyRoom` usa `nextStandardRoomNumber`, que conta só as salas 1–4. Mover o rack da vitrine é recusado em `rooms.visualPlacements.ts:95-97` com `SHOWCASE_RACK_FIXED`.

Máquina sem `.glb` não entra. A instalação passa por `installMinerForUser` → `decideShowcaseInstall` (`rooms.service.ts:441`, `rooms.showcase.ts:138-140`). O critério em `rooms.showcase.ts:116-126` aceita `modelUrl` em `/media/models/*.glb`, o nome exato `MinerCore MCX9` (depois de tirar o prefixo `[event]`), ou `imageUrl` contendo `/minercore-mcx9`. Fora desses três, a decisão é `SHOWCASE_3D_ONLY`. Nenhuma regra nova foi escrita.

O cliente escondia a sala mesmo quando o servidor a listava: `MachinesRoomTabs` filtrava `kind !== "showcase_3d"` e o efeito de `Inventory2Page` empurrava a sala ativa para fora da 101. Com a flag desligada a sala não vem no payload, então mostrar a aba quando ela vem listada não liga a sala em produção. Com a flag ligada, a aba usa `inventory.showcase_room_label` ("Sala 3D").

## Banco local

O `blockminer` em `127.0.0.1:5442` não tinha `user_rooms.kind`. A lista de salas respondia 500. Foi aplicado só neste banco, e só este SQL, o mesmo da migration `20261001040000_showcase_3d_room`:

```sql
ALTER TABLE "user_rooms" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'standard';
```

`migrate deploy` não rodou em 5442. O histórico local continua divergente.

## V2.50

### Fase 0 — Reconhecimento
- Estado: OBSERVADO
- Mudanças: nenhuma
- Evidências: sala 101, flag off, regra 3D já em `decideShowcaseInstall`. As três variantes acima não têm referência viva.
- Pendências: nenhuma
- Commit: nenhum

### Fase 1 — Arte
- Estado: VERIFICADO
- Mudanças: `showcase-3d-rack-fit.svg` e as três capturas da grade.
- Evidências: a grade 3×2 foi aprovada na legibilidade. Seis racks se contam, a silhueta separa do fundo `#0F1522`, os dois LEDs `#3D81F6` sobrevivem na escala pequena.
- Pendências: nenhuma
- Commit: `b103d87`

### Fase 2 — Aba
- Estado: VERIFICADO
- Mudanças: `machines.parts.tsx` desenha a sala que veio na lista. `Inventory2Page.tsx` permanece na sala ativa quando ela ainda está na lista; o fallback continua preferindo uma sala padrão desbloqueada.
- Evidências: com a flag off o payload não traz a 101, então a aba não aparece. Com a flag on no lab, a aba "Sala 3D" abriu a sala.
- Pendências: nenhuma
- Commit: `468ba40`

### Fase 3 — Testes
- Estado: VERIFICADO
- Mudanças: `machines.parts.test.tsx`, caso "shows the 3D room tab when that room is listed".
- Evidências: `cd client && npx vitest run` — Test Files 130 passed, Tests 1095 passed, exit 0, 64s. A base desta árvore era 1094 em 130; o caso novo está no arquivo que já existia.
- Pendências: nenhuma
- Commit: `468ba40`

### Fase 4 — Build e typecheck
- Estado: VERIFICADO
- Mudanças: nenhuma além da fase 2
- Evidências: `cd client && npx vite build` verde em 21.36s, exit 0. `tsc --noEmit -p tsconfig.json`: 61 linhas `error TS`. Nenhuma em `machines.parts.tsx`, `machines.parts.test.tsx` ou `Inventory2Page.tsx`. ESLint desses três arquivos: o erro de ref na linha 87 de `Inventory2Page.tsx` e o warning de `rerender` na linha 242 do teste já estavam no arquivo; o trecho deste lote não os introduz.
- Pendências: nenhuma
- Commit: `468ba40`

### Fase 5 — DOM no localhost
- Estado: VERIFICADO
- Mudanças: nenhuma de produto além da aba. `SHOWCASE_3D_ROOM_ENABLED=1` só no processo de lab. Turnstile desse processo removido e o 2FA de e-mail forçado em 0, para o formulário real completar.
- Evidências: usuário semeado 10043, e-mail `showcase-lab-…@localhost.test`, senha só no arquivo local, login pelo formulário (`#identifier`, `#password`, `data-testid="login-main-form"`), caiu em `/dashboard`. Na sala 3D, um rack comprado por 1 BLK. Duas MinerCore MCX9, critério pelo nome, instaladas pelas duas baias pelo diálogo "INSTALAR EQUIPAMENTO". O rack passou a 240.0 H/s. `document.scrollingElement`: em 1440, `scrollWidth` 1440 e `clientWidth` 1440, imagem do rack 732×527; em 320, `scrollWidth` 320 e `clientWidth` 320, imagem 284×204. As duas máquinas ficam dentro das aberturas. Capturas: `preview-maquina-1440.png` e `preview-maquina-320.png`. Conta, linhas dependentes e o arquivo de senha apagados. API em `:3000` e Vite em `127.0.0.1:5174` encerrados. O Vite de `127.0.0.1:5173` ficou no ar. Nenhum token forjado.
- Pendências: o dono julga as duas capturas com máquina
- Commit: `468ba40`

### Fase 6 — Carga
- Estado: BLOQUEADO
- Mudanças: nenhuma
- Evidências: não há API nova de produto. Sem k6.
- Pendências: nenhuma
- Commit: nenhum

### Fase 7 — Segurança ofensiva
- Estado: BLOQUEADO
- Mudanças: nenhuma
- Evidências: sem superfície nova. Sem kali. Nenhum pedido a blockminer.space.
- Pendências: nenhuma
- Commit: nenhum

### Fase 8 — Relatório
- Estado: VERIFICADO
- Mudanças: este arquivo e as duas capturas com máquina.
- Evidências: o texto acima. O código da aba é `468ba40`.
- Pendências: ligar `SHOWCASE_3D_ROOM_ENABLED=1` em produção, e substituir o svg do volume se ele já existir, só depois da aprovação das capturas com máquina. As três variantes órfãs esperam o dono.
- Commit: este arquivo
