/**
 * Ported from legacy/server/services/sidebarNavRegistry.ts (types only).
 */
export type SidebarSection = "main" | "earn" | "social";

export type SidebarRegistryItemDef = {
  path: string | null;
  labelKey: string;
  icon: string;
  section: SidebarSection;
  defaultParentItemId: string | null;
  parentLocked?: boolean;
  isGroup?: boolean;
};

export type SidebarPersistedEntry = {
  itemId: string;
  visible: boolean;
  sortOrder: number;
  section: SidebarSection;
  parentItemId: string | null;
};

export type SidebarAdminItemMeta = {
  labelKey: string;
  icon: string;
  section: SidebarSection;
  parentLocked: boolean;
  defaultParentItemId: string | null;
  isGroup: boolean;
};

export type SidebarCategoryItem = {
  itemId: string;
  labelKey: string;
  icon: string;
  path?: string | null;
  children?: Array<{ itemId: string; labelKey: string; icon: string; path: string | null }>;
};

export type SidebarCategory = {
  section: SidebarSection;
  titleKey: string;
  items: SidebarCategoryItem[];
};
