import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';

interface Row {
  id: string; status: string; billing_cycle: string;
  current_period_end: string | null; trial_ends_at: string | null;
  company: { id: string; name: string } | null;
  plan: { id: string; name: string } | null;
}

export default function GlobalAssinaturas() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('subscriptions')
        .select('id, status, billing_cycle, current_period_end, trial_ends_at, companies(id,name), plans(id,name)')
        .order('created_at', { ascending: false });
      setRows((data ?? []).map((d) => ({
        id: d.id, status: d.status, billing_cycle: d.billing_cycle,
        current_period_end: d.current_period_end, trial_ends_at: d.trial_ends_at,
        company: (d as { companies?: { id: string; name: string } }).companies ?? null,
        plan: (d as { plans?: { id: string; name: string } }).plans ?? null,
      })));
    })();
  }, []);
  return (
    <div className="p-8 space-y-6">
      <header>
        <h1 className="font-display text-3xl">Assinaturas</h1>
        <p className="text-sm text-muted-foreground">Visão consolidada por empresa.</p>
      </header>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Ciclo</th>
              <th className="px-4 py-3">Próximo vencimento</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3">{r.company?.name ?? '—'}</td>
                <td className="px-4 py-3">{r.plan?.name ?? '—'}</td>
                <td className="px-4 py-3">{r.status}</td>
                <td className="px-4 py-3">{r.billing_cycle}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.current_period_end ? new Date(r.current_period_end).toLocaleDateString('pt-BR') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
