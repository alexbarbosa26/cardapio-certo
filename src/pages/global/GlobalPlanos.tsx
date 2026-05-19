import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';

interface Plan {
  id: string; name: string; description: string | null;
  monthly_price: number; annual_price: number;
  max_users: number | null; max_tables: number | null; max_open_tabs: number | null;
  allow_tables_module: boolean; allow_tabs_module: boolean;
  allow_kitchen_module: boolean; allow_advanced_dashboard: boolean;
  status: string;
}

export default function GlobalPlanos() {
  const [plans, setPlans] = useState<Plan[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('plans').select('*').order('monthly_price');
      setPlans((data ?? []) as Plan[]);
    })();
  }, []);
  return (
    <div className="p-8 space-y-6">
      <header>
        <h1 className="font-display text-3xl">Planos</h1>
        <p className="text-sm text-muted-foreground">Catálogo de planos do MesaChef.</p>
      </header>
      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.id} className="p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl">{p.name}</h2>
              <span className="text-xs uppercase text-muted-foreground">{p.status}</span>
            </div>
            {p.description && <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>}
            <div className="mt-4 font-display text-3xl">
              R$ {Number(p.monthly_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              <span className="text-sm text-muted-foreground"> /mês</span>
            </div>
            <ul className="mt-4 text-sm space-y-1.5 text-muted-foreground">
              <li>Usuários: {p.max_users ?? 'ilimitado'}</li>
              <li>Mesas: {p.max_tables ?? 'ilimitado'}</li>
              <li>Comandas abertas: {p.max_open_tabs ?? 'ilimitado'}</li>
              <li>Módulo de mesas: {p.allow_tables_module ? '✓' : '—'}</li>
              <li>Módulo de comandas: {p.allow_tabs_module ? '✓' : '—'}</li>
              <li>Cozinha: {p.allow_kitchen_module ? '✓' : '—'}</li>
              <li>Dashboard avançado: {p.allow_advanced_dashboard ? '✓' : '—'}</li>
            </ul>
          </Card>
        ))}
        {plans.length === 0 && <p className="text-muted-foreground">Nenhum plano cadastrado.</p>}
      </div>
      <p className="text-xs text-muted-foreground">
        Para criar ou editar planos, use o painel de banco de dados do Lovable Cloud.
      </p>
    </div>
  );
}
