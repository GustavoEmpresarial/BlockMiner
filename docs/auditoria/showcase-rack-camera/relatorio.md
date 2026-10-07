# Câmera do rack 3D

Branch `fix/showcase-rack-camera` a partir de `origin/main` @ `2281f35`.
Worktree: `/home/gustavo/Documentos/BlockMiner2.1/fix-showcase-rack-camera`.
O checkout compartilhado não foi trocado. `.env.production` não foi editado. A conta 294 não foi usada.

## Causa

`RACK_MODEL_ORBIT` estava em `12deg 75deg 38%`. No model-viewer 3.5.0 a porcentagem do raio é fração de `idealCameraDistance()`, que vale `boundingSphere.radius / sin(fov/2)`. 38% enquadra a face e, no giro, a placa corta em cima e embaixo.

`105%` cabe a esfera inteira. Isso protege rotação em qualquer eixo. O auto-rotate deste rack gira só no yaw, e a baia é larga e baixa (651×188 em 1440, 248×66 em 320). Enquadrar a esfera deixa a face pequena: em 1440 ela ocupava cerca de 25% da largura e 39% da altura.

A altura projetada não é constante com a câmera a 75° (15° acima do horizonte). De perfil, o comprimento da placa entra na vertical, e essa vista fica mais alta que a face. Uma varredura de 24 ângulos, de 15° em 15°, no pixel da malha:

- phi 75°, raio 71.3%: cabe em todos os ângulos, mas a face fica em 38.1% × 58.5%. Abaixo disso a vista perto de 255° toca a base.
- phi 90°, raio 52.9% na baia de 651×188: cabe, face em 50.7% × 77.7%. 52.5% já corta em 255°.
- phi 90°, raio 54.5% na baia de 248×66: cabe, com a folga do bob de 2px. 54.2% corta em 255°.

A diferença entre 52.9% e 54.5% é cerca de 3% da placa. Os dois breakpoints usam o mesmo raio, o mais restritivo: `12deg 90deg 54.5%`. O campo de visão continua `16deg`. A largura que sobra é a baia (proporção ~3,5:1) contra a face da placa (~2,3:1): com a altura em ~76%, a face não passa de ~50% da largura sem cortar o perfil.

`OFFER_MODEL_FEATURE_ORBIT` (`16deg 72deg 68%`, FOV `16deg`) e `OFFER_MODEL_THUMB_ORBIT` (`18deg 74deg 88%`, FOV `20deg`) não mudaram.

`RACK_MACHINE_VISUAL_SCALE` continua `1.04` na arte da prateleira. O modelo 3D usa `RACK_MODEL_VISUAL_SCALE = 1`. O `overflow-hidden` do slot ficou. O viewBox do SVG e as coordenadas das baias não mudaram.

## Lab

Usuário semeado 10045, login pelo formulário, `SHOWCASE_3D_ROOM_ENABLED=1` só no processo de lab. Uma MinerCore MCX9 instalada numa baia. A câmera embarcada era `12deg 90deg 54.5%` / `16deg`. O theta foi posto em 0, 45, 90 e 135, com phi 90°. `scrollWidth` = `clientWidth` = 1440 e 320. O viewer mediu 651×188 e 248×66. Conta e senha apagadas depois das capturas.

Porcentagem da placa dentro do viewer (largura × altura), com a folga em pixels:

| viewport | ângulo | largura | altura | topo | base |
| --- | --- | --- | --- | --- | --- |
| 1440 | 0° | 49.4% | 75.7% | 21px | 25px |
| 1440 | 45° | 39.7% | 79.4% | 15px | 24px |
| 1440 | 90° | 10.7% | 82.5% | 10px | 23px |
| 1440 | 135° | 39.4% | 76.7% | 14px | 30px |
| 320 | 0° | 45.2% | 76.1% | 7px | 9px |
| 320 | 45° | 37.1% | 81.8% | 3px | 9px |
| 320 | 90° | 9.7% | 82.1% | 5px | 7px |
| 320 | 135° | 36.3% | 77.3% | 7px | 8px |

Nenhum dos oito quadros corta. A folga mais curta é 3px no topo, em 320 a 45°.

Capturas: `preview-1440-0.png`, `preview-1440-45.png`, `preview-1440-90.png`, `preview-1440-135.png`, `preview-320-0.png`, `preview-320-45.png`, `preview-320-90.png`, `preview-320-135.png`.
