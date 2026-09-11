-- Tournament metrics: faucet claims, shortlink rewards, auto-mining claims.
ALTER TYPE "TournamentMetric" ADD VALUE IF NOT EXISTS 'FAUCET';
ALTER TYPE "TournamentMetric" ADD VALUE IF NOT EXISTS 'SHORTLINK';
ALTER TYPE "TournamentMetric" ADD VALUE IF NOT EXISTS 'AUTO_MINING';
