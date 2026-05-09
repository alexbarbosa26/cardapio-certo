import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { fmtBRL } from '@/lib/format';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export const Route = createFileRoute('/_app/relatorios')({
  component: RelatoriosPage,
});

const COLORS = ['var(--accent)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

function RelatoriosPage() {
  const { profile } = useAuth();
  if (profile && profile.role !== 'admin') return <Navigate to="/mesas" />;

  const [range, setRange] = useState<'7' | '30'>('7');
  const [payments, setPayments] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const since = new Date(); since.setDate(since.getDate() - Number(range)); since.setHours(0,0,0,0);
      const { data: pays } = await supabase.from('payments')
        .select('amount, method, created_at')
        .eq('company_id', profile.company_id).gte('created_at', since.toISOString());
      setPayments((pays ?? []).map((p: any) => ({ ...p, amount: Number(p.amount) })));
      const { data: orders } = await supabase.from('orders').select('id, closed_at')
        .eq('company_id', profile.company_id).eq('status', 'fechado').gte('closed_at', since.toISOString());
      const ids = (orders ?? []).map((o: any) => o.id);
      if (ids.length) {
        const { data: oi } = await supabase.from('order_items').select('product_name, quantity, total_price, order_id').in('order_id', ids);
        setItems((oi ?? []).map((i: any) => ({ ...i, total_price: Number(i.total_price) })));
      } else setItems([]);
    })();
  }, [profile?.company_id, range]);

  const daily = useMemo(() => {
    const map = new Map<string, number>();
    const days = Number(range);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      map.set(d.toISOString().slice(0, 10), 0);
    }
    for (const p of payments) {
      const k = new Date(p.created_at).toISOString().slice(0, 10);
      if (map.has(k)) map.set(k, (map.get(k) ?? 0) + p.amount);
    }
    return Array.from(map.entries()).map(([d, v]) => ({
      date: new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      total: v,
    }));
  }, [payments, range]);

  const byMethod = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments) map.set(p.method, (map.get(p.method) ?? 0) + p.amount);
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [payments]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { qty: number; total: number }>();
    for (const i of items) {
      const cur = map.get(i.product_name) ?? { qty: 0, total: 0 };
      cur.qty += i.quantity; cur.total += i.total_price;
      map.set(i.product_name, cur);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total).slice(0, 8);
  }, [items]);

  const total = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Indicadores</p>
          <h1 className="font-display text-3xl sm:text-4xl mt-1">Relatórios</h1>
          <p className="text-sm text-muted-foreground mt-1">Total no período: <span className="font-semibold text-foreground">{fmtBRL(total)}</span></p>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as any)}>
          <TabsList>
            <TabsTrigger value="7">7 dias</TabsTrigger>
            <TabsTrigger value="30">30 dias</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
          <h3 className="font-display text-lg mb-4">Vendas por dia</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12}/>
                <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `R$${v}`}/>
                <Tooltip formatter={(v: any) => fmtBRL(v as number)} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }}/>
                <Line type="monotone" dataKey="total" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-display text-lg mb-4">Por forma de pagamento</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byMethod} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
                  {byMethod.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
                </Pie>
                <Tooltip formatter={(v: any) => fmtBRL(v as number)} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }}/>
                <Legend wrapperStyle={{ fontSize: 12, textTransform: 'capitalize' }}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-3 rounded-xl border border-border bg-card p-5">
          <h3 className="font-display text-lg mb-4">Top produtos</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `R$${v}`}/>
                <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={12} width={140}/>
                <Tooltip formatter={(v: any) => fmtBRL(v as number)} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }}/>
                <Bar dataKey="total" fill="var(--accent)" radius={[0, 6, 6, 0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
