UPDATE users AS u
SET pol_balance = u.pol_balance + sub.refund
FROM (
  SELECT user_id, (COUNT(*) * 8)::numeric(20, 8) AS refund
  FROM user_energy_generators
  GROUP BY user_id
) AS sub
WHERE u.id = sub.user_id;

DROP TABLE IF EXISTS "user_energy_generators";
