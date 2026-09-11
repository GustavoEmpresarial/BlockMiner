/**
 * Retroativo do item 92 — credita a comissão de referral (10%) que NÃO foi paga entre o
 * handoff (2026-08-12 04:10 UTC) e o momento em que o fix (persistBlockRewards) entrou no ar.
 *
 * Aprovado pelo usuário ("Sim, credita o atrasado também").
 *
 * v2 (reescrito depois de 2 problemas achados rodando a v1 contra produção real):
 *  1. `referredId: 0` como sentinela pra "várias pessoas indicadas agregadas por bloco" —
 *     ForeignKeyConstraintViolation (a coluna tem FK real pra users.id, 0 não existe). Corrigido
 *     agrupando por (referrer, referido, bloco) — a MESMA granularidade que o sistema ao vivo já
 *     usa, então referredId é sempre um usuário real.
 *  2. Depois de corrigir (1), a granularidade fina gerou 194 mil grupos — checar existência UM
 *     POR UM (1 query cada) levaria dias. Reescrito pra abordagem em lote: uma query pra buscar
 *     TODAS as comissões já existentes na janela de uma vez (Set em memória pra filtrar), UM
 *     UPDATE em lote pro saldo (soma por referrer, mesmo padrão de
 *     mining.repository.ts's persistBlockRewards), e createMany em chunks pro ledger.
 *
 * Como funciona (e por que é seguro rodar):
 *  - Fonte da verdade: `mining_rewards_log` — cada linha é o que um usuário REALMENTE minerou
 *    num bloco. Para cada linha cujo minerador tem `referredBy`, o indicador deveria ter
 *    ganho 10% em POL e SHIB. Determinístico e reconstituível a partir do log.
 *  - Janela: --from (default 2026-08-12 04:10:00 UTC, o handoff) até --to (obrigatório passar
 *    explicitamente — ver nota abaixo sobre por que a auto-detecção original era arriscada).
 *  - IDEMPOTÊNCIA: só credita (referrer, referido, bloco) que NÃO tem já uma
 *    referral_earning `source = mining_block_<n>` pra aquele par exato. Rodar duas vezes não
 *    paga de novo.
 *  - lifetime_mined_pol NÃO é tocado (comissão não é mineração do indicador), igual ao fix ao vivo.
 *
 * NOTA sobre --to: a v1 tentava auto-detectar a fronteira (primeira referral_earning depois de
 * --from) — mas como a ÚLTIMA linha do sistema ANTIGO (antes de quebrar) tinha o mesmo prefixo
 * de source e ficou a poucos milissegundos do --from default, a auto-detecção pegava a fronteira
 * ERRADA (quase não cobria nada). Passe --to explícito sempre, com o horário real em que o fix
 * (item 92) foi deployado.
 *
 * Uso:
 *   node backfill-referral-commission.mjs --to "2026-08-14 00:20:00" --dry
 *   node backfill-referral-commission.mjs --to "2026-08-14 00:20:00" --apply
 *   (opcional) --from "2026-08-12 04:10:00"
 *
 * SEM --apply é DRY-RUN (só imprime o que faria). Nada é escrito sem --apply.
 */
import prisma from "./dist/server/core/database/prisma.js";
import { Prisma } from "@prisma/client";

const RATE = 0.1;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const APPLY = process.argv.includes("--apply");
const FROM = new Date(`${arg("--from", "2026-08-12 04:10:00")}Z`.replace(" ", "T"));
const toArg = arg("--to", null);
if (!toArg) {
  console.error("ERRO: passe --to explícito (ex: --to \"2026-08-14 00:20:00\"). Ver comentário no topo do arquivo.");
  process.exit(1);
}
const TO = new Date(`${toArg}Z`.replace(" ", "T"));

async function main() {
  console.log(`Janela: ${FROM.toISOString()}  →  ${TO.toISOString()}`);
  console.log(APPLY ? ">>> MODO APPLY (vai escrever)\n" : ">>> DRY-RUN (nada será escrito — use --apply)\n");

  if (TO <= FROM) {
    console.log("Janela vazia (TO <= FROM). Nada a fazer.");
    return;
  }

  // 1) Reconstrói a comissão devida por (indicador, indicado, bloco) a partir do log de
  // mineração — mesma granularidade do sistema ao vivo (buildReferralEarningsRows).
  console.log("Calculando comissão devida a partir de mining_rewards_log...");
  const owedRaw = await prisma.$queryRaw`
    SELECT u.referred_by            AS referrer_id,
           mrl.user_id              AS referred_id,
           mrl.block_number         AS block_number,
           SUM(mrl.reward_amount)      * ${RATE} AS pol,
           SUM(mrl.reward_amount_shib) * ${RATE} AS shib,
           MIN(mrl.created_at)      AS created_at
      FROM mining_rewards_log mrl
      JOIN users u ON u.id = mrl.user_id
     WHERE u.referred_by IS NOT NULL
       AND u.referred_by <> mrl.user_id
       AND mrl.created_at >  ${FROM}
       AND mrl.created_at <  ${TO}
     GROUP BY u.referred_by, mrl.user_id, mrl.block_number
     HAVING SUM(mrl.reward_amount) > 0 OR SUM(mrl.reward_amount_shib) > 0
  `;
  console.log(`Grupos (indicador, indicado, bloco) candidatos: ${owedRaw.length}`);

  // 2) UMA query pra buscar todas as comissões já existentes na janela (pago ao vivo OU
  // execução anterior deste script) — filtra em memória, sem 1 round-trip por grupo.
  console.log("Buscando comissões já existentes na janela (pra idempotência)...");
  const existingRows = await prisma.$queryRaw`
    SELECT referrer_id, referred_id, source
      FROM referral_earnings
     WHERE source LIKE 'mining_block_%'
       AND created_at >= ${FROM}
       AND created_at <  ${TO}
  `;
  const existingSet = new Set(existingRows.map((r) => `${r.referrer_id}:${r.referred_id}:${r.source}`));
  console.log(`Comissões já existentes na janela: ${existingSet.size}`);

  const owed = owedRaw.filter((row) => {
    const key = `${Number(row.referrer_id)}:${Number(row.referred_id)}:mining_block_${Number(row.block_number)}`;
    return !existingSet.has(key);
  });
  console.log(`Grupos a creditar (após filtrar já pagos): ${owed.length}`);

  if (owed.length === 0) {
    console.log("\nNada a fazer — tudo já coberto.");
    return;
  }

  // 3) Agrega por referrer pra UM UPDATE em lote de saldo (mesmo padrão de
  // mining.repository.ts's persistBlockRewards — não 1 UPDATE por linha).
  const balanceByReferrer = new Map();
  let totalPol = 0;
  let totalShib = 0;
  for (const row of owed) {
    const referrerId = Number(row.referrer_id);
    const pol = Number(row.pol) || 0;
    const shib = Number(row.shib) || 0;
    const cur = balanceByReferrer.get(referrerId) || { pol: 0, shib: 0 };
    cur.pol += pol;
    cur.shib += shib;
    balanceByReferrer.set(referrerId, cur);
    totalPol += pol;
    totalShib += shib;
  }

  console.log(`\nIndicadores distintos a creditar: ${balanceByReferrer.size}`);
  console.log(`TOTAL POL:  ${totalPol.toFixed(6)}`);
  console.log(`TOTAL SHIB: ${totalShib.toFixed(2)}`);

  if (!APPLY) {
    console.log(`\n(nada foi escrito — rode com --apply para efetivar)`);
    return;
  }

  // 4) Aplica: UM UPDATE em lote pro saldo, createMany em chunks pro ledger. Tudo numa
  // transação só, pra não deixar saldo creditado sem o ledger correspondente (ou vice-versa).
  const balanceRows = Array.from(balanceByReferrer.entries()).sort((a, b) => a[0] - b[0]);
  const CHUNK = 500;

  await prisma.$transaction(
    async (tx) => {
      const values = balanceRows.map(
        ([userId, d]) => Prisma.sql`(${userId}::int, ${d.pol}::double precision, ${d.shib}::double precision)`,
      );
      await tx.$executeRaw`
        UPDATE users AS u
           SET pol_balance  = u.pol_balance  + v.pol,
               shib_balance = u.shib_balance + v.shib
          FROM (VALUES ${Prisma.join(values)}) AS v(id, pol, shib)
         WHERE u.id = v.id
      `;

      for (let i = 0; i < owed.length; i += CHUNK) {
        const chunk = owed.slice(i, i + CHUNK);
        await tx.referralEarning.createMany({
          data: chunk.map((row) => ({
            referrerId: Number(row.referrer_id),
            referredId: Number(row.referred_id),
            amount: Number(row.pol) || 0,
            amountShib: new Prisma.Decimal(Number(row.shib) || 0),
            source: `mining_block_${Number(row.block_number)}`,
            createdAt: row.created_at,
          })),
        });
      }
    },
    { timeout: 120_000 },
  );

  console.log(`\nAPLICADO: ${balanceRows.length} indicadores creditados, ${owed.length} linhas de ledger criadas.`);
}

main()
  .catch((e) => {
    console.error("ERRO:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
