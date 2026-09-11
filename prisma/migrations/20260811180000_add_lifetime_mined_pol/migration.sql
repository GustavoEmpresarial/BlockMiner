-- Incremental lifetime-mined counter, maintained alongside pol_balance in the settlement
-- write path. Replaces a live SUM(reward_amount) over mining_rewards_log on every wallet
-- balance read (that table has 21M+ rows in the restored prod dump).
ALTER TABLE "users" ADD COLUMN "lifetime_mined_pol" DECIMAL(20,8) NOT NULL DEFAULT 0;

UPDATE "users" u
   SET "lifetime_mined_pol" = COALESCE(agg.total, 0)
  FROM (
    SELECT user_id, SUM(reward_amount) AS total
      FROM mining_rewards_log
     GROUP BY user_id
  ) agg
 WHERE u.id = agg.user_id;
