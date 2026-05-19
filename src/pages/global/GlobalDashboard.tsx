import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';

interface Stats {
  companies_total: number;
  companies_active: number;
  companies_trial: number;
  companies_suspended: number;
  companies_canceled: number;
  users_total: number;
  orders_total: number;
}

export default function GlobalDashboard() {
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const [comp, subs, users, orders] = await Promise.all([
        supabase.from('companies').select('id', { count: 'exact', head: true }),
        supabase.from('subscriptions').select('status'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('orders').select('id', { count: 'exact', head: true }),
      ]);
      const byStatus: Record<string, number> = {};
      (subs.data ?? []).forEach((r) => { byStatus[r.status] = (byStatus[r.status] ?? 0) + 1; });
      setS({
        companies_total: comp.count ?? 0,
        companies_active: byStatus['active'] ?? 0,
        companies_trial: byStatus['trialing'] ?? 0,
        companies_suspended: byStatus['suspended'] ?? 0,
        companies_canceled: byStatus['canceled'] ?? 0,
        users_total: users.count ?? 0,
        orders_total: orders.count ?? 0,
      });
    })();
  }, []);

  return (
    <div className="p-8 space-y-6">
      <header>
        <h1 className="font-display text-3xl">Visão geral do SaaS</h1>
        <p className="text-sm text-muted-foreground">Métricas consolidadas de todas as empresas.</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Empresas" value={s?.companies_total} />
        <Metric label="Ativas" value={s?.companies_active} accent />
        <Metric label="Em trial" value={s?.companies_trial} />
        <Metric label="Suspensas" value={s?.companies_suspended} />
        <Metric label="Canceladas" value={s?.companies_canceled} />
        <Metric label="Usuários" value={s?.users_total} />
        <Metric label="Pedidos processados" value={s?.orders_total} />
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value?: number; accent?: boolean }) {
  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-2 font-display text-3xl ${accent ? 'text-accent' : ''}`}>{value ?? '—'}</div>
    </Card>
  );
}
