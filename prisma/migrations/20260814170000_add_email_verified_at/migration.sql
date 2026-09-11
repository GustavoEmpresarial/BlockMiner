-- item 95 Parte B: verificação de email no registro (pentest blockminer.space).
-- Adiciona a coluna e faz backfill imediato pra todo usuário JÁ EXISTENTE (grandfather-in) —
-- ninguém que já estava cadastrado antes deste deploy fica travado em ações que passam a
-- exigir email verificado. Só contas criadas DEPOIS deste deploy nascem com NULL.
ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMP(3);

UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;
