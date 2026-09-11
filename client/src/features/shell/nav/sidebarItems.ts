/**
 * Navegação do utilizador: barra inferior mobile e reexport do fallback do menu lateral.
 * O menu completo (desktop + drawer) usa estes destinos em conjunto com `/api/sidebar/nav`
 * (ver `userDashboardNav.config.ts`). Mantém paths e labels da barra inferior num único sítio.
 */

export { USER_DASHBOARD_NAV_FALLBACK } from './userDashboardNav.config';

/** Auth required for this route (`protected` is reserved in TS types; quoted key matches runtime). */
export type SidebarItem = {
  labelKey: string;
  path: string;
  page: string;
  protected: boolean;
};

/** Itens da barra fixa inferior (mobile). Ícones Lucide são resolvidos em `Sidebar.tsx` pelo campo `page`. */
export const mobileBottomNavItems: SidebarItem[] = [
  { page: 'dashboard', labelKey: 'sidebar.mobile_home', path: '/dashboard', protected: true },
  { page: 'machines', labelKey: 'sidebar.mobile_machines', path: '/inventory', protected: true },
  { page: 'shop', labelKey: 'sidebar.shop', path: '/shop', protected: true },
  { page: 'wallet', labelKey: 'sidebar.wallet', path: '/wallet', protected: true },
];
