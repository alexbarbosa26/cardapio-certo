import { Link, Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Building2, Package, Receipt, FileClock, LogOut, ChefHat, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/global/dashboard', label: 'Visão Geral', icon: LayoutDashboard },
  { to: '/global/empresas', label: 'Empresas', icon: Building2 },
  { to: '/global/usuarios', label: 'Usuários', icon: Users },
  { to: '/global/planos', label: 'Planos', icon: Package },
  { to: '/global/assinaturas', label: 'Assinaturas', icon: Receipt },
  { to: '/global/auditoria', label: 'Auditoria', icon: FileClock },
];

export default function GlobalAdminLayout() {
  const { loading, isSuperAdmin, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useLocation().pathname;

  if (loading) return null;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden lg:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-foreground">
              <ChefHat className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">MesaChef</div>
              <div className="text-[11px] uppercase tracking-wider text-accent">Painel Global</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map((it) => {
            const Icon = it.icon;
            const active = path.startsWith(it.to);
            return (
              <Link key={it.to} to={it.to} className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/85 hover:bg-sidebar-accent/60',
              )}>
                <Icon className={cn('h-4 w-4', active ? 'text-accent' : 'text-sidebar-foreground/60')} />
                <span>{it.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-sidebar-accent text-sm font-semibold">
              {profile?.name?.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm font-medium">{profile?.name}</div>
              <div className="text-[11px] uppercase tracking-wide text-accent">Super Admin</div>
            </div>
            <Button variant="ghost" size="icon" onClick={async () => { await signOut(); navigate('/login'); }}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
