/**
 * Ported from legacy/server/modules/banners/infrastructure/repositories/banners.repository.ts.
 * Flattened into the module root — current/ doctrine has no infrastructure/ subfolder.
 */
import prisma from "../../core/database/prisma.js";

export async function listActiveBannersNow(now: Date) {
  return prisma.dashboardBanner.findMany({
    where: {
      isActive: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [
        {
          OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listAllBanners() {
  return prisma.dashboardBanner.findMany({ orderBy: { createdAt: "desc" } });
}

export type CreateBannerInput = {
  title: string;
  message: string;
  imageUrl: string | null;
  type: string;
  link: string | null;
  linkLabel: string | null;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
};

export async function createBanner(data: CreateBannerInput) {
  return prisma.dashboardBanner.create({ data });
}

export type UpdateBannerInput = Partial<{
  title: string;
  message: string;
  imageUrl: string | null;
  type: string;
  link: string | null;
  linkLabel: string | null;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}>;

export async function updateBanner(id: number, data: UpdateBannerInput) {
  return prisma.dashboardBanner.update({ where: { id }, data });
}

export async function deleteBanner(id: number): Promise<void> {
  await prisma.dashboardBanner.delete({ where: { id } });
}
