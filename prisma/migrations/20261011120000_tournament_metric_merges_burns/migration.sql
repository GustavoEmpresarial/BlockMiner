-- Add MERGES and BURNS to TournamentMetric enum
ALTER TYPE "TournamentMetric" ADD VALUE IF NOT EXISTS 'MERGES';
ALTER TYPE "TournamentMetric" ADD VALUE IF NOT EXISTS 'BURNS';
