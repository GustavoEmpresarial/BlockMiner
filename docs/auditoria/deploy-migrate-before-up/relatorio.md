# Migration antes de recriar o app

Branch `fix/deploy-migrate-before-up` a partir de `origin/main` @ `4242177`.
Worktree: `/home/gustavo/Documentos/BlockMiner2.1/fix-deploy-migrate-before-up`.
`fix/faucet-measure` não foi editada. O checkout compartilhado não foi trocado.

## O que muda

`storage/scripts/deploy/deploy.py`, função `_docker_stack`, usada por prod e staging.

Antes: `compose up -d --force-recreate --no-deps app` e, só depois, `compose exec -T app npx prisma migrate deploy || true`.

Agora o deploy aplica a migration num container avulso e só então recria o app:

```sh
compose run --rm --no-deps --entrypoint npx app prisma migrate deploy --schema=prisma/schema.prisma
```

Se esse comando sai diferente de zero, o script imprime `ALERTA` em stderr e dá `exit 1`. O `compose up --force-recreate` não roda. O container que já atende o tráfego permanece.

No staging, antes desse passo, o script faz `compose up -d db`. Em prod, não. O serviço `db` de prod está no profile `local-db`; nomeá-lo sobe um Postgres vazio. O comentário que já estava no script diz isso.

## Por que `compose run` e `--entrypoint npx`

`compose exec` precisa do container `app` no ar. Antes do recreate, o container no ar é o antigo, com a imagem antiga, sem as migrations novas. `compose run` usa a imagem que o `compose build app` acabou de gerar, mais o bind `./prisma:/app/prisma` que o serviço já declara. Não publica porta: o `--service-ports` não entra no comando, e a ajuda do Compose v2.40.3 mostra que publicar as portas do serviço é opt-in. Um ensaio local com `container_name` apontando para um container que já existia imprimiu a saída do comando avulso e deixou esse container de pé.

`--entrypoint npx` pula o `docker-entrypoint.sh`. Esse script roda `prisma migrate deploy` e, se falhar, segue e faz `exec` do servidor. Sem o override, a falha da migration seria engolida dentro do entrypoint e o passo do deploy veria sucesso.

## O que um deploy sem migration pendente faz

No Prisma instalado neste checkout (`node_modules/prisma/build/cli.js`), `migrate deploy` com lista aplicada vazia retorna o texto `No pending migrations to apply.` e não lança. O binário trata retorno que não é `Error` como saída 0 (`cli.js` por volta da linha 5659: `console.log(p), 0`).

Isso foi executado, não só lido. Postgres descartável em `127.0.0.1:5544`, banco vazio, as 26 migrations deste `origin/main` marcadas com `migrate resolve --applied`, depois `migrate deploy`:

- stdout contém `No pending migrations to apply.`
- exit 0

O mesmo binário, com erro de verdade, sai 1:

- banco vazio, migration SQL que referencia `users` ainda inexistente: `P3018`, exit 1
- segunda tentativa com essa migration registrada como falha: `P3009`, exit 1
- host `127.0.0.1:1`: `P1001`, exit 1

Um deploy sem migration pendente, portanto, passa do `if` e chega no recreate, como hoje chega no `up`. A diferença é a ordem e o fato de um exit 1 agora parar o script.

O banco local `blockminer` em `127.0.0.1:5442` não serviu para esse ensaio. `migrate status` saiu 1: o histórico diverge (última migration em comum `20260930223000_minercore_mcx9_delivery`, e dezenas de migrations que estão no banco e não estão nesta árvore). `migrate deploy` não foi executado lá.

## O que não foi testado

Não houve SSH, não houve `deploy.py` contra a VM, não houve `docker compose build` da imagem `app`, não houve `compose run` com essa imagem. O fluxo inteiro de produção não está verificado.

`docker-entrypoint.sh` continua com `npx prisma migrate deploy || { echo Warning; ... }` e só então sobe o `node`. Depois que o passo novo passou, esse segundo `migrate deploy` é o caso "nada pendente" (exit 0) e o servidor sobe com o schema já aplicado. Se esse segundo migrate falhar por outro motivo, o entrypoint ainda sobe o servidor. Isso não foi alterado: mudar o entrypoint para sair 1 derrubaria um container que já substituiu o antigo. Fica registrado.

O `curl` do `/health` no fim do script continua com `|| true`. Não faz parte desta correção.

## Verificação do texto do script

`tests/deploy/deploy-migrate-order.test.mjs`: em prod e em staging, `prisma migrate deploy` aparece antes de `up -d --force-recreate --no-deps app`, o `|| true` dessa migration não está mais, o `compose exec` sumiu, e `bash -n` aceita os dois scripts. Staging contém `compose up -d db`; prod não. 2 passaram.

Código: `afbeadc`.
