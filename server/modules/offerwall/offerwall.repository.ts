/**
 * Offerwall Analytics Repository — data access for cross-provider aggregation.
 * Strictly typed without `@ts-nocheck`.
 */
import prisma from "../../core/database/prisma.js";
import type { FetchOfferwallRawFilter } from "./offerwall.types.js";

const INTERNAL_COMPLETED = "COMPLETED";

export async function fetchOfferwallAnalyticsRaw(filter: FetchOfferwallRawFilter) {
  const userFilter = filter.userId != null ? { userId: filter.userId } : {};
  const dateInternal = { completedAt: { gte: filter.from, lte: filter.to } };
  const dateCallback = { createdAt: { gte: filter.from, lte: filter.to } };
  const dateZerads = { callbackAt: { gte: filter.from, lte: filter.to } };

  const [
    internalAgg,
    omeAgg,
    multiAgg,
    ggAgg,
    zeradsAgg,
    internalRows,
    omeRows,
    multiRows,
    ggRows,
    zeradsRows,
  ] = await Promise.all([
    // 1. Internal offerwall completions
    prisma.internalOfferwallAttempt.aggregate({
      where: { ...userFilter, status: INTERNAL_COMPLETED, ...dateInternal },
      _count: { id: true },
    }),
    // 2. Offerwall.me postbacks
    prisma.offerwallMeCallback.aggregate({
      where: { ...userFilter, status: 1, ...dateCallback },
      _count: { id: true },
      _sum: { polCredited: true },
    }),
    // 3. Multiwall (Offerwall PRO) postbacks
    prisma.multiwallCallback.aggregate({
      where: { ...userFilter, status: 1, ...dateCallback },
      _count: { id: true },
      _sum: { polCredited: true },
    }),
    // 4. Offerwall.GG postbacks
    prisma.offerwallGgCallback.aggregate({
      where: { ...userFilter, status: 1, ...dateCallback },
      _count: { id: true },
      _sum: { polCredited: true },
    }),
    // 5. Zerads PTC callbacks
    prisma.zeradsCallback.aggregate({
      where: { ...userFilter, ...dateZerads },
      _count: { id: true },
      _sum: { clicks: true, payoutAmount: true },
    }),
    // 6. Detailed rows for daily grouping
    prisma.internalOfferwallAttempt.findMany({
      where: { ...userFilter, status: INTERNAL_COMPLETED, ...dateInternal },
      select: {
        completedAt: true,
        offer: { select: { rewardPolAmount: true, rewardBlkAmount: true } },
      },
    }),
    prisma.offerwallMeCallback.findMany({
      where: { ...userFilter, status: 1, ...dateCallback },
      select: { createdAt: true, polCredited: true },
    }),
    prisma.multiwallCallback.findMany({
      where: { ...userFilter, status: 1, ...dateCallback },
      select: { createdAt: true, polCredited: true },
    }),
    prisma.offerwallGgCallback.findMany({
      where: { ...userFilter, status: 1, ...dateCallback },
      select: { createdAt: true, polCredited: true },
    }),
    prisma.zeradsCallback.findMany({
      where: { ...userFilter, ...dateZerads },
      select: { callbackAt: true, clicks: true, payoutAmount: true },
    }),
  ]);

  return {
    internalAgg,
    omeAgg,
    multiAgg,
    ggAgg,
    zeradsAgg,
    internalRows,
    omeRows,
    multiRows,
    ggRows,
    zeradsRows,
  };
}
