import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';

interface Row {
  id: string; created_at: string; action: string;
  actor_user_id: string | null; actor_role: string | null;
  company_id: string | null; entity_type: string | null; entity_id: string | null;
  new_value: Record<string, unknown> | null;
}

export default function GlobalAuditoria() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('audit_logs').select('*')
        .order('created_at', { ascending: false }).limit(200);
      setRows((data ?? []) as Row[]);
    })();
  }, []);
  return (
    <div className="p-8 space-y-6">
      <header>
        <h1 className="font-display text-3xl">Auditoria</h1>
        <p className="text-sm text-muted-foreground">Últimas 200 ações sensíveis do painel global.</p>
      </header>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-3">Quando</th>
              <th className="px-4 py-3">Ação</th>
              <th className="px-4 py-3">Entidade</th>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString('pt-BR')}
                </td>
                <td className="px-4 py-3 font-medium">{r.action}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.entity_type ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.company_id ?? '—'}</td>
                <td className="px-4 py-3 text-xs"><pre className="whitespace-pre-wrap max-w-md">{JSON.stringify(r.new_value, null, 2)}</pre></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sem registros.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
