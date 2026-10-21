/**
 * Dev-only task catalog preview (TASKS_PREVIEW_CATALOG=1).
 *
 * The dev VM shares the production database. The new task catalog is stored there with
 * isActive=false and a `v2-` slug prefix, so production never tracks or pays it. With the
 * flag on, dev treats exactly those rows as the live catalog and claims pay nothing.
 */
import type { Prisma } from "@prisma/client";

export const TASK_CATALOG_V2_SLUG_PREFIX = "v2-";

export function isTasksPreviewMode(): boolean {
  const v = String(process.env.TASKS_PREVIEW_CATALOG ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Which definitions count as "live" for progress, the dashboard and claims. */
export function liveCatalogWhere(): Prisma.DailyTaskDefinitionWhereInput {
  return isTasksPreviewMode()
    ? { slug: { startsWith: TASK_CATALOG_V2_SLUG_PREFIX } }
    : { isActive: true };
}
