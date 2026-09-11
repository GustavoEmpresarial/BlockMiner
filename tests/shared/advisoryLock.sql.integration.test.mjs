/**
 * Guarda de regressão do item 93 — Postgres real.
 *
 * Bug coberto: nos itens 85 (offer-events) e 86 (shop) eu usei
 * `pg_advisory_xact_lock(${a}::bigint, ${b}::bigint)`. A forma de DOIS argumentos do advisory
 * lock é `pg_advisory_xact_lock(int4, int4)` — NÃO existe overload (bigint, bigint), e bigint
 * não faz cast implícito pra int4. Resultado: TODA compra na loja e TODA coleta de máquina
 * grátis quebrava com "function pg_advisory_xact_lock(bigint, bigint) does not exist" → 500,
 * em produção, por ~1h até ser pego.
 *
 * A lição real: eu tinha testado a LÓGICA PURA do lock (limite por usuário) mas nunca o SQL
 * do lock em si — nenhum teste EXECUTAVA o `$executeRaw`. Este teste roda os dois casts contra
 * um Postgres de verdade: o ::int (correto) tem que passar, o ::bigint (o que eu tinha) tem
 * que falhar exatamente com a mensagem de "function does not exist".
 */
import test from "node:test";
import assert from "node:assert/strict";

const { default: prisma } = await import("../../server/core/database/prisma.ts");

test.after(async () => {
  await prisma.$disconnect();
});

test("item 93: a forma correta pg_advisory_xact_lock(int, int) executa dentro de uma transação", async () => {
  await prisma.$transaction(async (tx) => {
    // Não deve lançar. O valor de retorno é void; o que importa é não estourar.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${1234}::int, ${27}::int)`;
  });
});

test("item 93: a forma ANTIGA (bigint, bigint) — a que eu tinha — realmente NÃO existe no Postgres", async () => {
  await assert.rejects(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${1234}::bigint, ${27}::bigint)`;
      }),
    (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      // Postgres: "function pg_advisory_xact_lock(bigint, bigint) does not exist"
      assert.match(msg, /pg_advisory_xact_lock\(bigint, bigint\)|does not exist/i);
      return true;
    },
    "a forma bigint/bigint tinha que falhar — é exatamente o bug do item 93",
  );
});
