# Câmera do rack 3D

Branch `fix/showcase-rack-camera` a partir de `origin/main` @ `2281f35`.
Worktree: `/home/gustavo/Documentos/BlockMiner2.1/fix-showcase-rack-camera`.
O checkout compartilhado não foi trocado. `.env.production` não foi editado. A conta 294 não foi usada.

## Causa

`RACK_MODEL_ORBIT` estava em `12deg 75deg 38%`. No model-viewer 3.5.0 a porcentagem do raio é fração de `idealCameraDistance()`, que vale `boundingSphere.radius / sin(fov/2)`. 100% cabe a esfera dos bounds no campo de visão. 38% enquadra a face da placa e, no giro, a diagonal dessa esfera sai por cima e por baixo.

O raio do rack passou para `12deg 75deg 105%`. 105% é a margem do próprio model-viewer (a órbita default da biblioteca). O campo de visão do rack continua `16deg`: com o raio em porcentagem, mudar o FOV não muda o enquadramento da esfera.

`OFFER_MODEL_FEATURE_ORBIT` (`16deg 72deg 68%`, FOV `16deg`) e `OFFER_MODEL_THUMB_ORBIT` (`18deg 74deg 88%`, FOV `20deg`) não mudaram. São constantes separadas, usadas só quando o modo não é `rack`.

`RACK_MACHINE_VISUAL_SCALE` continua `1.04` na arte da prateleira. O modelo 3D usa `RACK_MODEL_VISUAL_SCALE = 1`. O `scale(1.04)` com `origin-bottom` empurrava a esfera já enquadrada para fora da baia. O `overflow-hidden` do slot ficou. O viewBox do SVG e as coordenadas das baias não mudaram.

## Lab

Usuário semeado 10044, login pelo formulário, `SHOWCASE_3D_ROOM_ENABLED=1` só no processo de lab. Uma MinerCore MCX9 instalada numa baia. A câmera foi parada e o theta foi posto em 0, 45, 90 e 135 graus, com phi 75° e raio 105%. O `getCameraOrbit()` devolveu esses ângulos. Conta e senha apagadas. API `:3000` e Vite `:5174` encerrados. O Vite de `:5173` ficou no ar.

Em 1440 o `model-viewer` mediu 651×188 e `scrollWidth` = `clientWidth` = 1440. Em 320 mediu 248×66 e `scrollWidth` = `clientWidth` = 320. Nos oito quadros a placa fica inteira, com faixa escura em cima e embaixo, inclusive na vista de perfil (135°), que é a projeção alta.

Capturas: `preview-1440-0.png`, `preview-1440-45.png`, `preview-1440-90.png`, `preview-1440-135.png`, `preview-320-0.png`, `preview-320-45.png`, `preview-320-90.png`, `preview-320-135.png`.

## Gate

`cd client && npx vite build` exit 0. Suíte do client: 1101 testes em 132 arquivos, exit 0. Este `origin/main` já estava acima dos 1095/130 do lote anterior; o arquivo novo `OfferMinerModel.test.ts` acrescenta 2. `tests/rooms/rooms.showcase.unit.test.mjs`: 9 passaram. `tsc --noEmit`: 61 `error TS`, exit 2, nenhum nestes arquivos.
