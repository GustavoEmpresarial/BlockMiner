import React from 'react';
import type { SidebarAdminItemMeta, SidebarPersistedEntry, SidebarSection } from '../adminSidebarNav.types';
import { SidebarItemRow } from './SidebarItemRow';

interface SidebarSectionCardProps {
  section: SidebarSection;
  title: string;
  description: string;
  entries: SidebarPersistedEntry[];
  itemMeta: Record<string, SidebarAdminItemMeta>;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onToggleVisibility: (itemId: string) => void;
}

export const SidebarSectionCard: React.FC<SidebarSectionCardProps> = ({
  section,
  title,
  description,
  entries,
  itemMeta,
  onMoveUp,
  onMoveDown,
  onToggleVisibility,
}) => {
  const sectionEntries = entries.filter((e) => e.section === section);
  const activeCount = sectionEntries.filter((e) => e.visible).length;

  // Separate roots and group children for clean hierarchical rendering
  const roots = sectionEntries.filter((e) => e.parentItemId === null);
  const childrenMap = new Map<string, SidebarPersistedEntry[]>();

  for (const entry of sectionEntries) {
    if (entry.parentItemId) {
      const list = childrenMap.get(entry.parentItemId) || [];
      list.push(entry);
      childrenMap.set(entry.parentItemId, list);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3">
        <div>
          <h2 className="text-base font-bold text-white">{title}</h2>
          <p className="text-xs text-slate-400">{description}</p>
        </div>
        <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300">
          {activeCount} de {sectionEntries.length} ativos
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {roots.map((root) => {
          const globalRootIndex = entries.findIndex((e) => e.itemId === root.itemId);
          const meta = itemMeta[root.itemId];
          const children = childrenMap.get(root.itemId) || [];

          return (
            <React.Fragment key={root.itemId}>
              <SidebarItemRow
                entry={root}
                meta={meta}
                canMoveUp={globalRootIndex > 0}
                canMoveDown={globalRootIndex < entries.length - 1}
                onMoveUp={() => onMoveUp(globalRootIndex)}
                onMoveDown={() => onMoveDown(globalRootIndex)}
                onToggleVisibility={() => onToggleVisibility(root.itemId)}
              />

              {/* Render Nested Children (e.g. under rewards_group) */}
              {children.map((child) => {
                const globalChildIndex = entries.findIndex((e) => e.itemId === child.itemId);
                const childMeta = itemMeta[child.itemId];

                return (
                  <SidebarItemRow
                    key={child.itemId}
                    entry={child}
                    meta={childMeta}
                    canMoveUp={globalChildIndex > 0}
                    canMoveDown={globalChildIndex < entries.length - 1}
                    onMoveUp={() => onMoveUp(globalChildIndex)}
                    onMoveDown={() => onMoveDown(globalChildIndex)}
                    onToggleVisibility={() => onToggleVisibility(child.itemId)}
                    isNested
                  />
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
