import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface TabPillItem {
  key: string;
  label: ReactNode;
  icon?: LucideIcon;
  badge?: ReactNode;
  disabled?: boolean;
}

export type TabPillsVariant = 'primary' | 'emerald' | 'amber';

export interface TabPillsProps {
  tabs: TabPillItem[];
  activeTab: string;
  onChange: (key: string) => void;
  variant?: TabPillsVariant;
  ariaLabel: string;
  className?: string;
}

const ACTIVE_VARIANT_STYLES: Record<TabPillsVariant, string> = {
  primary: 'border-primary bg-primary/20 text-white shadow-[2px_2px_0px_#000000] translate-y-[-1px]',
  emerald: 'border-emerald-500 bg-emerald-500/20 text-white shadow-[2px_2px_0px_#000000] translate-y-[-1px]',
  amber: 'border-amber-500 bg-amber-500/20 text-white shadow-[2px_2px_0px_#000000] translate-y-[-1px]',
};

const ICON_ACTIVE_STYLES: Record<TabPillsVariant, string> = {
  primary: 'text-primary',
  emerald: 'text-emerald-400',
  amber: 'text-amber-400',
};

export default function TabPills({
  tabs,
  activeTab,
  onChange,
  variant = 'primary',
  ariaLabel,
  className = '',
}: TabPillsProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const enabledTabs = tabs.filter((t) => !t.disabled);
    const enabledIndex = enabledTabs.findIndex((t) => t.key === tabs[currentIndex].key);
    let nextIndex = enabledIndex;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (enabledIndex + 1) % enabledTabs.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (enabledIndex - 1 + enabledTabs.length) % enabledTabs.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = enabledTabs.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    const nextTab = enabledTabs[nextIndex];
    onChange(nextTab.key);

    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])');
    if (buttons && buttons[nextIndex]) {
      buttons[nextIndex].focus();
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar scroll-smooth ${className}`.trim()}
    >
      {tabs.map((tab, idx) => {
        const Icon = tab.icon;
        const isSelected = activeTab === tab.key;
        const isDisabled = tab.disabled;

        return (
          <button
            key={tab.key}
            role="tab"
            id={`tab-${tab.key}`}
            aria-selected={isSelected}
            aria-controls={`panel-${tab.key}`}
            tabIndex={isSelected ? 0 : -1}
            disabled={isDisabled}
            onClick={() => !isDisabled && onChange(tab.key)}
            onKeyDown={(e) => !isDisabled && handleKeyDown(e, idx)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all border-2 select-none outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              isDisabled
                ? 'opacity-40 cursor-not-allowed border-slate-800 bg-slate-950/40 text-slate-600'
                : isSelected
                  ? ACTIVE_VARIANT_STYLES[variant]
                  : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white hover:border-slate-700 active:translate-y-0.5'
            }`}
          >
            {Icon && (
              <Icon
                className={`w-3.5 h-3.5 ${
                  isDisabled ? 'text-slate-600' : isSelected ? ICON_ACTIVE_STYLES[variant] : 'text-slate-400'
                }`}
                aria-hidden="true"
              />
            )}
            <span>{tab.label}</span>
            {tab.badge && <span className="ml-1">{tab.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}
