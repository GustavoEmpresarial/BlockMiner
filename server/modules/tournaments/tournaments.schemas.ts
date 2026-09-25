import { z } from "zod";
import { isTournamentValidMetric, TOURNAMENT_VALID_METRICS } from "./tournaments.valid-metrics.js";

export const TOURNAMENT_TYPE_VALUES = ["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"] as const;
export const TOURNAMENT_PRIZE_TYPES = ["POL", "BLK", "MINING_BOOST", "MACHINE"] as const;

export const MAX_TOURNAMENT_DURATION_MS = 90 * 24 * 60 * 60 * 1000;
export const MAX_PRIZE_NUMERIC = 1_000_000_000;

export const tournamentIdParamSchema = z.object({
  id: z.coerce.number().int().positive("ID do torneio deve ser um número inteiro positivo."),
});

export const tournamentUserParamSchema = z.object({
  id: z.coerce.number().int().positive("ID do torneio deve ser um número inteiro positivo."),
  userId: z.coerce.number().int().positive("ID do usuário deve ser um número inteiro positivo."),
});

export const prizeInputSchema = z
  .object({
    id: z.number().int().positive().optional(),
    rankFrom: z.coerce.number().int().min(1, "Rank inicial deve ser no mínimo 1."),
    rankTo: z.coerce.number().int().min(1, "Rank final deve ser no mínimo 1."),
    prizeType: z.enum(TOURNAMENT_PRIZE_TYPES, {
      errorMap: () => ({ message: "Tipo de prêmio inválido." }),
    }),
    polAmount: z.coerce.number().min(0).max(MAX_PRIZE_NUMERIC).optional(),
    blkAmount: z.coerce.number().min(0).max(MAX_PRIZE_NUMERIC).optional(),
    boostHashRate: z.coerce.number().min(0).max(MAX_PRIZE_NUMERIC).optional(),
    boostHours: z.coerce.number().int().min(1).max(8760).optional(),
    minerId: z.coerce.number().int().positive().nullable().optional(),
    minerCount: z.coerce.number().int().min(1).max(100).default(1),
  })
  .refine((p) => p.rankTo >= p.rankFrom, {
    message: "Rank final (rankTo) deve ser igual ou maior que rank inicial (rankFrom).",
    path: ["rankTo"],
  });

export const createTournamentSchema = z
  .object({
    name: z
      .string({ required_error: "Nome é obrigatório." })
      .trim()
      .min(1, "Nome é obrigatório.")
      .max(100, "Nome não pode exceder 100 caracteres."),
    description: z
      .string()
      .trim()
      .max(500, "Descrição não pode exceder 500 caracteres.")
      .optional()
      .default(""),
    type: z.enum(TOURNAMENT_TYPE_VALUES, {
      errorMap: () => ({ message: "Tipo de torneio inválido." }),
    }),
    metric: z.string().refine((m) => isTournamentValidMetric(m), {
      message: "Métrica do torneio inválida.",
    }),
    startsAt: z.string({ required_error: "Data de início é obrigatória." }).refine(
      (s) => !Number.isNaN(new Date(s).getTime()),
      { message: "Data de início inválida." },
    ),
    endsAt: z.string({ required_error: "Data de término é obrigatória." }).refine(
      (s) => !Number.isNaN(new Date(s).getTime()),
      { message: "Data de término inválida." },
    ),
    recurring: z.boolean().default(false),
    prizes: z.array(prizeInputSchema).default([]),
  })
  .refine(
    (data) => {
      const start = new Date(data.startsAt);
      const end = new Date(data.endsAt);
      return end.getTime() > start.getTime();
    },
    {
      message: "A data de término deve ser posterior à data de início.",
      path: ["endsAt"],
    },
  )
  .refine(
    (data) => {
      const start = new Date(data.startsAt);
      const end = new Date(data.endsAt);
      return end.getTime() - start.getTime() <= MAX_TOURNAMENT_DURATION_MS;
    },
    {
      message: "A duração do torneio não pode exceder 90 dias.",
      path: ["endsAt"],
    },
  );

export const updateTournamentSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    type: z.enum(TOURNAMENT_TYPE_VALUES).optional(),
    metric: z.string().refine((m) => isTournamentValidMetric(m)).optional(),
    startsAt: z
      .string()
      .refine((s) => !Number.isNaN(new Date(s).getTime()))
      .optional(),
    endsAt: z
      .string()
      .refine((s) => !Number.isNaN(new Date(s).getTime()))
      .optional(),
    recurring: z.boolean().optional(),
    prizes: z.array(prizeInputSchema).optional(),
  })
  .refine(
    (data) => {
      if (data.startsAt && data.endsAt) {
        const start = new Date(data.startsAt);
        const end = new Date(data.endsAt);
        return end.getTime() > start.getTime();
      }
      return true;
    },
    {
      message: "A data de término deve ser posterior à data de início.",
      path: ["endsAt"],
    },
  );

export const updateDisplayOrderSchema = z.object({
  typeOrder: z
    .array(z.string().trim().min(1))
    .min(1, "A ordem deve conter pelo menos 1 tipo.")
    .max(20, "A ordem não pode exceder 20 tipos."),
});
