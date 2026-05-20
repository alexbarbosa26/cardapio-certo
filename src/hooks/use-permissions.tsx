import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useTenantBranding } from '@/hooks/use-tenant-branding';

export type Permission =
  | 'manage_company'
  | 'manage_users'
  | 'manage_products'
  | 'manage_cash_register'
  | 'view_reports'
  | 'view_advanced_dashboard'
  | 'use_tables'
  | 'use_tabs'
  | 'use_kitchen';

interface PermissionsCtx {
  has: (p: Permission) => boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

const Ctx = createContext<PermissionsCtx | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { profile, isSuperAdmin } = useAuth();
  const b = useTenantBranding();
  const role = profile?.role;
  const isAdmin = role === 'admin';

  const has = (p: Permission): boolean => {
    if (isSuperAdmin) return true;
    switch (p) {
      case 'manage_company':
      case 'manage_users':
      case 'manage_products':
      case 'manage_cash_register':
      case 'view_reports':
        return isAdmin;
      case 'view_advanced_dashboard':
        return isAdmin && b.plan.allowAdvancedDashboard;
      case 'use_tables':
        return b.plan.allowTables && b.enableTables;
      case 'use_tabs':
        return b.plan.allowTabs && b.enableTabs;
      case 'use_kitchen':
        return b.plan.allowKitchen && b.enableKitchen;
      default:
        return false;
    }
  };

  return <Ctx.Provider value={{ has, isAdmin, isSuperAdmin }}>{children}</Ctx.Provider>;
}

export function usePermissions() {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePermissions fora do PermissionsProvider');
  return v;
}

export function Can({ permission, children, fallback = null }: {
  permission: Permission; children: ReactNode; fallback?: ReactNode;
}) {
  const { has } = usePermissions();
  return <>{has(permission) ? children : fallback}</>;
}
