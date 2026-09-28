import { z } from "zod";
import {
  REWARD_MACHINE,
  REWARD_POL,
  REWARD_TEMPORARY_POWER,
} from "./checkin.milestones.js";

export const idParamSchema = z
  .object({
    id: z.coerce.number().int().positive().max(2_147_483_647),
  })
  .strict();

export const milestoneCreateSchema = z
  .object({
    dayThreshold: z.coerce.number().int().positive().max(10_000),
    rewardType: z.enum([REWARD_POL, REWARD_TEMPORARY_POWER, REWARD_MACHINE]),
    rewardValue: z.coerce.number().min(0).max(1_000_000).default(0),
    validityDays: z.coerce.number().int().positive().max(365).optional().default(1),
    durationHours: z.coerce.number().int().positive().max(8760).optional(),
    minerId: z.coerce.number().int().positive().max(2_147_483_647).nullable().optional(),
    active: z.boolean().optional().default(true),
    sortOrder: z.coerce.number().int().min(-10_000).max(10_000).optional().default(0),
  })
  .strict()
  .refine(
    (d) => {
      if (d.rewardType === REWARD_POL) {
        return d.rewardValue > 0 && d.minerId == null;
      }
      if (d.rewardType === REWARD_TEMPORARY_POWER) {
        const hours = d.durationHours ?? (d.validityDays ? d.validityDays * 24 : 0);
        return d.rewardValue > 0 && hours > 0 && d.minerId == null;
      }
      if (d.rewardType === REWARD_MACHINE) {
        return d.minerId != null && d.minerId > 0;
      }
      return true;
    },
    {
      message:
        "Invalid milestone reward configuration (POL requires positive value without minerId, temporary_power requires positive value and durationHours without minerId, machine requires minerId).",
    },
  );

export const milestoneUpdateSchema = z
  .object({
    dayThreshold: z.coerce.number().int().positive().max(10_000).optional(),
    rewardType: z.enum([REWARD_POL, REWARD_TEMPORARY_POWER, REWARD_MACHINE]).optional(),
    rewardValue: z.coerce.number().min(0).max(1_000_000).optional(),
    validityDays: z.coerce.number().int().positive().max(365).optional(),
    durationHours: z.coerce.number().int().positive().max(8760).optional(),
    minerId: z.coerce.number().int().positive().max(2_147_483_647).nullable().optional(),
    active: z.boolean().optional(),
    sortOrder: z.coerce.number().int().min(-10_000).max(10_000).optional(),
  })
  .strict();
