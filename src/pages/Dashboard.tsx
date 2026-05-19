import { Navigate, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { fmtBRL } from '@/lib/format';
import { TrendingUp, ShoppingBag, UtensilsCrossed, Receipt, ClipboardList, CreditCard } from 'lucide-react';

function DashboardPage() {
  const { profile } = useAuth();
  const redirectNonAdmin = !!profile && profile.role !== 'admin';
  const [stats, setStats] = useState({
    vendas: 0,
    vendasMesa: 0,
    vendasComanda: 0,
    pedidos: 0,
    mesasOcupadas: 0,
    comandasAbertas: 0,
    ticket: 0,
    topCat: [] as { name: string; total: number }[],
  });

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);

      const [paysRes, openOrdersRes, openTabsRes, closedOrdersRes, closedTabsRes] = await Promise.all([
        supabase.from('payments')
          .select('amount, method')
          .eq('company_id', profile.company_id)
          .eq('status', 'ativo')
          .gte('created_at', today.toISOString()),
        supabase.from('orders').select('id, table_id')
          .eq('company_id', profile.company_id).eq('status', 'aberto'),
        supabase.from('customer_tabs').select('id')
          .eq('company_id', profile.company_id).eq('status', 'aberta'),
        supabase.from('orders').select('id')
          .eq('company_id', profile.company_id).eq('status', 'fechado')
          .gte('closed_at', today.toISOString()),
        supabase.from('tab_payments')
          .select('amount')
          .eq('company_id', profile.company_id)
          .eq('status', 'ativo')
          .gte('created_at', today.toISOString()),
      ]);

      const vendasMesa = (paysRes.data ?? []).reduce((s, p: any) => s + Number(p.amount), 0);
      const vendasComanda = (closedTabsRes.data ?? []).reduce((s, p: any) => s + Number(p.amount), 0);
      const vendas = vendasMesa + vendasComanda;
      const pedidos = (closedOrdersRes.data ?? []).length;

      // top categorias hoje (combina order_items + tab_items)
      const orderIds = (closedOrdersRes.data ?? []).map((o: any) => o.id);
      const catMap = new Map<string, number>();
      if (orderIds.length) {
        const [oiRes, prodRes, catRes] = await Promise.all([
          supabase.from('order_items').select('total_price, product_id').in('order_id', orderIds),
          supabase.from('products').select('id, category_id').eq('company_id', profile.company_id),
          supabase.from('categories').select('id, name').eq('company_id', profile.company_id),
        ]);
        const prodCat = new Map((prodRes.data ?? []).map((p: any) => [p.id, p.category_id]));
        const catName = new Map((catRes.data ?? []).map((c: any) => [c.id, c.name]));
        for (const it of oiRes.data ?? []) {
          const cat = catName.get(prodCat.get((it as any).product_id) as any) ?? 'Outros';
          catMap.set(cat, (catMap.get(cat) ?? 0) + Number((it as any).total_price));
        }
      }
      const { data: ti } = await supabase
        .from('tab_items')
        .select('total_price, category_name, created_at')
        .eq('company_id', profile.company_id)
        .is('canceled_at', null)
        .gte('created_at', today.toISOString());
      for (const it of ti ?? []) {
        const cat = (it as any).category_name ?? 'Outros';
        catMap.set(cat, (catMap.get(cat) ?? 0) + Number((it as any).total_price));
      }
      const topCat = Array.from(catMap.entries())
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      setStats({
        vendas,
        vendasMesa,
        vendasComanda,
        pedidos,
        mesasOcupadas: new Set((openOrdersRes.data ?? []).map((o: any) => o.table_id)).size,
        comandasAbertas: (openTabsRes.data ?? []).length,
        ticket: pedidos > 0 ? vendas / pedidos : 0,
        topCat,
      });
    })();
  }, [profile?.company_id]);

  if (redirectNonAdmin) return <Navigate to="/mesas" />;

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Visão geral</p>
        <h1 className="font-display text-3xl sm:text-4xl mt-1">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Olá, {profile?.name}. Resumo de hoje.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Vendas do dia" value={fmtBRL(stats.vendas)} icon={TrendingUp} accent />
        <Stat label="Vendas mesas" value={fmtBRL(stats.vendasMesa)} icon={UtensilsCrossed} />
        <Stat label="Vendas comandas" value={fmtBRL(stats.vendasComanda)} icon={ClipboardList} />
        <Stat label="Ticket médio" value={fmtBRL(stats.ticket)} icon={CreditCard} />
        <Stat label="Pedidos finalizados" value={String(stats.pedidos)} icon={Receipt} />
        <Stat label="Mesas ocupadas" value={String(stats.mesasOcupadas)} icon={UtensilsCrossed} />
        <Stat label="Comandas abertas" value={String(stats.comandasAbertas)} icon={ClipboardList} />
        <Stat label="Categorias ativas" value={String(stats.topCat.length)} icon={ShoppingBag} />
      </div>

      {stats.topCat.length > 0 && (
        <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-card">
          <h3 className="font-display text-xl mb-4">Top categorias hoje</h3>
          <div className="space-y-3">
            {stats.topCat.map((c) => {
              const pct = stats.topCat[0].total > 0 ? (c.total / stats.topCat[0].total) * 100 : 0;
              return (
                <div key={c.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{c.name}</span>
                    <span className="tabular-nums text-muted-foreground">{fmtBRL(c.total)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink to="/mesas" icon={UtensilsCrossed} title="Mesas" desc="Operação e fechamento." />
        <QuickLink to="/comandas" icon={ClipboardList} title="Comandas" desc="PDV simplificado." />
        <QuickLink to="/cozinha" icon={Receipt} title="Cozinha" desc="Pedidos pendentes." />
        <QuickLink to="/relatorios" icon={ShoppingBag} title="Relatórios" desc="Vendas e top produtos." />
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon, accent }: any) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${accent ? 'text-accent' : 'text-muted-foreground'}`} />
      </div>
      <div className="mt-3 font-display text-3xl">{value}</div>
    </div>
  );
}

function QuickLink({ to, icon: Icon, title, desc }: any) {
  return (
    <Link to={to} className="group rounded-2xl border border-border bg-card p-6 hover:border-accent transition shadow-card">
      <Icon className="h-5 w-5 text-accent" />
      <h3 className="mt-3 font-display text-xl">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{desc}</p>
    </Link>
  );
}

export default DashboardPage;
