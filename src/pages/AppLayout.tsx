import { Outlet, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { useTenantTypography } from '@/hooks/use-tenant-typography';
import { useTenantBranding } from '@/hooks/use-tenant-branding';
import {
  LayoutDashboard, UtensilsCrossed, ChefHat, Package, Users, Wallet,
  BarChart3, Settings as SettingsIcon, MessageSquare, Receipt, LogOut, Menu, ChefHat as Logo, ListPlus,
  ClipboardList,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type NavKey = 'dashboard' | 'mesas' | 'comandas' | 'cozinha' | 'produtos' | 'grupos' | 'usuarios' | 'caixa' | 'relatorios' | 'config' | 'wpp' | 'nf';
interface NavItem { key: NavKey; to: string; label: string; icon: React.ComponentType<{ className?: string }>; admin?: boolean; soon?: boolean; }

const NAV: NavItem[] = [
  { key: 'dashboard', to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, admin: true },
  { key: 'mesas', to: '/mesas', label: 'Mesas', icon: UtensilsCrossed },
  { key: 'comandas', to: '/comandas', label: 'Comandas', icon: ClipboardList },
  { key: 'cozinha', to: '/cozinha', label: 'Cozinha', icon: ChefHat },
  { key: 'produtos', to: '/produtos', label: 'Produtos', icon: Package, admin: true },
  { key: 'grupos', to: '/grupos-opcoes', label: 'Grupos de opções', icon: ListPlus, admin: true },
  { key: 'usuarios', to: '/usuarios', label: 'Usuários', icon: Users, admin: true },
  { key: 'caixa', to: '/caixa', label: 'Caixa', icon: Wallet, admin: true },
  { key: 'relatorios', to: '/relatorios', label: 'Relatórios', icon: BarChart3, admin: true },
  { key: 'config', to: '/configuracoes', label: 'Configurações', icon: SettingsIcon, admin: true },
  { key: 'wpp', to: '/whatsapp', label: 'WhatsApp', icon: MessageSquare, admin: true, soon: true },
  { key: 'nf', to: '/notas-fiscais', label: 'Notas Fiscais', icon: Receipt, admin: true, soon: true },
];

function AppLayout() {
  const { loading, user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  useTenantTypography();
  const branding = useTenantBranding();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!profile) return <div className="p-8 text-center text-muted-foreground">Carregando perfil…</div>;

  const isAllowed = (k: NavKey) => {
    if (k === 'mesas') return branding.plan.allowTables && branding.enableTables;
    if (k === 'comandas') return branding.plan.allowTabs && branding.enableTabs;
    if (k === 'cozinha') return branding.plan.allowKitchen && branding.enableKitchen;
    if (k === 'dashboard') return branding.plan.allowAdvancedDashboard;
    return true;
  };
  const items = NAV.filter((i) => (!i.admin || profile.role === 'admin') && isAllowed(i.key));
  const companyName = branding.displayName ?? profile.company_name ?? 'MesaChef';

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden bg-background">
      <aside className="hidden lg:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <BrandHeader companyName={companyName} logoUrl={branding.logoUrl} />
        <NavList items={items} />
        <UserCard name={profile.name} role={profile.role} onSignOut={async () => { await signOut(); navigate('/login'); }} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <header className="lg:hidden sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 backdrop-blur px-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon"><Menu className="h-5 w-5"/></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar text-sidebar-foreground border-sidebar-border p-0">
              <BrandHeader companyName={companyName} logoUrl={branding.logoUrl} />
              <NavList items={items} onNavigate={() => setMobileOpen(false)} />
              <UserCard name={profile.name} role={profile.role} onSignOut={async () => { setMobileOpen(false); await signOut(); navigate('/login'); }} />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{companyName}</span>
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="logo" className="h-7 w-7 rounded-md object-contain bg-card border border-border" />
            ) : (
              <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground"><Logo className="h-4 w-4" /></div>
            )}
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden">
          <Outlet />
        </main>
        <footer className="py-2 text-center text-[10px] uppercase tracking-[0.25em] text-muted-foreground/70">
          Powered by MesaChef
        </footer>
      </div>
    </div>
  );
}

function BrandHeader({ companyName, logoUrl }: { companyName: string; logoUrl: string | null }) {
  return (
    <div className="px-5 py-5 border-b border-sidebar-border">
      <div className="flex items-center gap-2">
        {logoUrl ? (
          <img src={logoUrl} alt="logo" className="h-9 w-9 rounded-lg object-contain bg-sidebar-accent" />
        ) : (
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Logo className="h-5 w-5" />
          </div>
        )}
        <div className="leading-tight min-w-0">
          <div className="text-sm font-semibold truncate">{companyName}</div>
          <div className="text-[11px] text-sidebar-foreground/60">MesaChef</div>
        </div>
      </div>
    </div>
  );
}

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const path = useLocation().pathname;
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
      {items.map((it) => {
        const active = path.startsWith(it.to);
        const Icon = it.icon;
        const inner = (
          <>
            <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-accent' : 'text-sidebar-foreground/60')} />
            <span className="flex-1">{it.label}</span>
            {it.soon && <span className="rounded bg-sidebar-accent px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-sidebar-foreground/60">em breve</span>}
          </>
        );
        const cls = cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
          active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/85 hover:bg-sidebar-accent/60',
          it.soon && 'opacity-60 cursor-not-allowed',
        );
        return it.soon ? (
          <div key={it.to} className={cls}>{inner}</div>
        ) : (
          <Link key={it.to} to={it.to} className={cls} onClick={() => onNavigate?.()}>{inner}</Link>
        );
      })}
    </nav>
  );
}

function UserCard({ name, role, onSignOut }: { name: string; role: string | null; onSignOut: () => void }) {
  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="flex items-center gap-3 px-2 py-2">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-sidebar-accent text-sm font-semibold">
          {name.slice(0,1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="text-[11px] uppercase tracking-wide text-sidebar-foreground/60">{role}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={onSignOut} className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default AppLayout;
