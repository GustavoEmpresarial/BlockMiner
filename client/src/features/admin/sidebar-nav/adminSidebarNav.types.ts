export type SidebarSection = "main" | "earn" | "social";

export interface SidebarPersistedEntry {
  itemId: string;
  visible: boolean;
  sortOrder: number;
  section: SidebarSection;
  parentItemId: string | null;
}

export interface SidebarAdminItemMeta {
  labelKey: string;
  icon: string;
  section: SidebarSection;
  parentLocked: boolean;
  defaultParentItemId: string | null;
  isGroup: boolean;
}

export interface SidebarCategoryChild {
  itemId: string;
  labelKey: string;
  icon: string;
  path: string | null;
}

export interface SidebarCategoryItem {
  itemId: string;
  labelKey: string;
  icon: string;
  path?: string | null;
  children?: SidebarCategoryChild[];
}

export interface SidebarCategory {
  section: SidebarSection;
  titleKey: string;
  items: SidebarCategoryItem[];
}

export interface AdminSidebarNavResponse {
  ok: boolean;
  entries: SidebarPersistedEntry[];
  categories: SidebarCategory[];
  itemMeta: Record<string, SidebarAdminItemMeta>;
}

export interface AdminSidebarNavUpdateInput {
  entries: SidebarPersistedEntry[];
}

export interface AdminSidebarNavUpdateResponse {
  ok: boolean;
  entries: SidebarPersistedEntry[];
  categories: SidebarCategory[];
  code?: string;
}
