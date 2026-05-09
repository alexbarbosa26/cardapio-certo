import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { fmtBRL } from '@/lib/format';
import { TrendingUp, ShoppingBag, UtensilsCrossed, Receipt } from 'lucide-react';

export const Route = createFileRoute('/_app/dashboard')({
  component: DashboardPage,
});

function DashboardPage() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({ vendas: 0, pedidos: 0, mesasOcupadas: 0, ticket: 0 });

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const today = new Date(); today.setHours(0,0,0,0);
      const { data: closed } = await supabase
        .from('orders').select('total')
        .eq('company_id', profile.company_id)
        .eq('status', 'fechado')
        .gte('closed_at', today.toISOString());
      const { data: open } = await supabase
        .from('orders').select('id, table_id')
        .eq('company_id', profile.company_id).eq('status', 'aberto');
      const vendas = (closed ?? []).reduce((s, o: any) => s + Number(o.total), 0);
      const pedidos = (closed ?? []).length;
      setStats({
        vendas, pedidos,
        mesasOcupadas: new Set((open ?? []).map((o: any) => o.table_id)).size,
        ticket: pedidos > 0 ? vendas / pedidos : 0,
      });
    })();
  }, [profile?.company_id]);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Visão geral</p>
        <h1 className="font-display text-3xl sm:text-4xl mt-1">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Olá, {profile?.name}. Resumo de hoje.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Vendas do dia" value={fmtBRL(stats.vendas)} icon={TrendingUp} accent />
        <Stat label="Pedidos finalizados" value={String(stats.pedidos)} icon={Receipt} />
        <Stat label="Mesas ocupadas" value={String(stats.mesasOcupadas)} icon={UtensilsCrossed} />
        <Stat label="Ticket médio" value={fmtBRL(stats.ticket)} icon={ShoppingBag} />
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link to="/mesas" className="group rounded-2xl border border-border bg-card p-6 hover:border-accent transition shadow-card">
          <UtensilsCrossed className="h-5 w-5 text-accent" />
          <h3 className="mt-3 font-display text-2xl">Operação de mesas</h3>
          <p className="text-sm text-muted-foreground mt-1">Abrir, gerenciar pedidos e fechar contas.</p>
        </Link>
        <Link to="/cozinha" className="group rounded-2xl border border-border bg-card p-6 hover:border-accent transition shadow-card">
          <Receipt className="h-5 w-5 text-accent" />
          <h3 className="mt-3 font-display text-2xl">Painel da cozinha</h3>
          <p className="text-sm text-muted-foreground mt-1">Ver pedidos pendentes e marcar como prontos.</p>
        </Link>
      </div>

      <div className="mt-10 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        Caixa, relatórios detalhados e gráficos virão na próxima fase do MVP.
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
