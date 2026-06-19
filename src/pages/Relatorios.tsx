import { Navigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { fmtBRL } from '@/lib/format';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

const COLORS = ['var(--accent)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-2)'];

type Origin = 'todas' | 'mesa' | 'comanda';
type RangePreset = '7' | '30' | '90' | 'custom';

const toLocalKey = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
};

function RelatoriosPage() {
  const { profile } = useAuth();
  const redirectNonAdmin = !!profile && profile.role !== 'admin';

  const [preset, setPreset] = useState<RangePreset>('7');
  const [startDate, setStartDate] = useState<string>(toLocalKey(daysAgo(6)));
  const [endDate, setEndDate] = useState<string>(toLocalKey(new Date()));
  const [origin, setOrigin] = useState<Origin>('todas');
  const [methodFilter, setMethodFilter] = useState<string>('todos');
  const [categoryFilter, setCategoryFilter] = useState<string>('todas');

  const [orderPays, setOrderPays] = useState<any[]>([]);
  const [tabPays, setTabPays] = useState<any[]>([]);
  const [items, setItems] = useState<{ name: string; category: string; quantity: number; total: number; origin: 'mesa' | 'comanda' }[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const applyPreset = (p: RangePreset) => {
    setPreset(p);
    if (p === 'custom') return;
    const days = Number(p);
    setStartDate(toLocalKey(daysAgo(days - 1)));
    setEndDate(toLocalKey(new Date()));
  };

  const onStartChange = (v: string) => {
    setStartDate(v);
    setPreset('custom');
  };
  const onEndChange = (v: string) => {
    setEndDate(v);
    setPreset('custom');
  };

  const { sinceISO, untilISO, dayList } = useMemo(() => {
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd); start.setHours(0, 0, 0, 0);
    const end = new Date(ey, em - 1, ed); end.setHours(23, 59, 59, 999);
    const days: string[] = [];
    const cur = new Date(start);
    while (cur <= end && days.length < 400) {
      days.push(toLocalKey(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return { sinceISO: start.toISOString(), untilISO: end.toISOString(), dayList: days };
  }, [startDate, endDate]);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const cid = profile.company_id;

      const [paysRes, tabPaysRes, ordersRes, tabItemsRes, prodRes, catRes] = await Promise.all([
        supabase.from('payments').select('amount, method, created_at').eq('company_id', cid).eq('status', 'ativo').gte('created_at', sinceISO).lte('created_at', untilISO),
        supabase.from('tab_payments').select('amount, method, created_at').eq('company_id', cid).eq('status', 'ativo').gte('created_at', sinceISO).lte('created_at', untilISO),
        supabase.from('orders').select('id, closed_at').eq('company_id', cid).eq('status', 'fechado').gte('closed_at', sinceISO).lte('closed_at', untilISO),
        supabase.from('tab_items').select('product_name, category_name, quantity, total_price, created_at').eq('company_id', cid).is('canceled_at', null).gte('created_at', sinceISO).lte('created_at', untilISO),
        supabase.from('products').select('id, name, category_id').eq('company_id', cid),
        supabase.from('categories').select('id, name').eq('company_id', cid),
      ]);

      setOrderPays((paysRes.data ?? []).map((p: any) => ({ ...p, amount: Number(p.amount) })));
      setTabPays((tabPaysRes.data ?? []).map((p: any) => ({ ...p, amount: Number(p.amount) })));

      const catName = new Map<string, string>((catRes.data ?? []).map((c: any) => [c.id, c.name]));
      const prodMap = new Map<string, string>((prodRes.data ?? []).map((p: any) => [p.id, catName.get(p.category_id) ?? 'Outros']));

      const orderIds = (ordersRes.data ?? []).map((o: any) => o.id);
      let oi: any[] = [];
      if (orderIds.length) {
        const { data } = await supabase.from('order_items').select('product_name, product_id, quantity, total_price').in('order_id', orderIds).is('canceled_at', null);
        oi = data ?? [];
      }

      const allItems = [
        ...oi.map((i: any) => ({
          name: i.product_name as string,
          category: prodMap.get(i.product_id) ?? 'Outros',
          quantity: Number(i.quantity),
          total: Number(i.total_price),
          origin: 'mesa' as const,
        })),
        ...(tabItemsRes.data ?? []).map((i: any) => ({
          name: i.product_name as string,
          category: i.category_name ?? 'Outros',
          quantity: Number(i.quantity),
          total: Number(i.total_price),
          origin: 'comanda' as const,
        })),
      ];
      setItems(allItems);

      const cats = new Set<string>();
      allItems.forEach((i) => cats.add(i.category));
      setCategories(Array.from(cats).sort());
    })();
  }, [profile?.company_id, sinceISO, untilISO]);

  const payments = useMemo(() => {
    const fromOrders = orderPays.map((p) => ({ ...p, origin: 'mesa' as const }));
    const fromTabs = tabPays.map((p) => ({ ...p, origin: 'comanda' as const }));
    let all = [...fromOrders, ...fromTabs];
    if (origin !== 'todas') all = all.filter((p) => p.origin === origin);
    if (methodFilter !== 'todos') all = all.filter((p) => p.method === methodFilter);
    return all;
  }, [orderPays, tabPays, origin, methodFilter]);

  const filteredItems = useMemo(() => {
    let all = items;
    if (origin !== 'todas') all = all.filter((i) => i.origin === origin);
    if (categoryFilter !== 'todas') all = all.filter((i) => i.category === categoryFilter);
    return all;
  }, [items, origin, categoryFilter]);

  const methods = useMemo(() => {
    const s = new Set<string>();
    [...orderPays, ...tabPays].forEach((p) => s.add(p.method));
    return Array.from(s);
  }, [orderPays, tabPays]);

  const daily = useMemo(() => {
    const map = new Map<string, number>();
    for (const k of dayList) map.set(k, 0);
    for (const p of payments) {
      const k = toLocalKey(new Date(p.created_at));
      if (map.has(k)) map.set(k, (map.get(k) ?? 0) + p.amount);
    }
    return Array.from(map.entries()).map(([d, v]) => {
      const [y, m, day] = d.split('-').map(Number);
      return {
        date: new Date(y, m - 1, day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        total: v,
      };
    });
  }, [payments, dayList]);

  const byMethod = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments) map.set(p.method, (map.get(p.method) ?? 0) + p.amount);
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [payments]);

  const byOrigin = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments) map.set(p.origin, (map.get(p.origin) ?? 0) + p.amount);
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [payments]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of filteredItems) map.set(i.category, (map.get(i.category) ?? 0) + i.total);
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredItems]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { qty: number; total: number }>();
    for (const i of filteredItems) {
      const cur = map.get(i.name) ?? { qty: 0, total: 0 };
      cur.qty += i.quantity; cur.total += i.total;
      map.set(i.name, cur);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total).slice(0, 10);
  }, [filteredItems]);

  const total = payments.reduce((s, p) => s + p.amount, 0);
  const totalMesa = payments.filter((p) => p.origin === 'mesa').reduce((s, p) => s + p.amount, 0);
  const totalComanda = payments.filter((p) => p.origin === 'comanda').reduce((s, p) => s + p.amount, 0);

  if (redirectNonAdmin) return <Navigate to="/mesas" />;

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Indicadores</p>
          <h1 className="font-display text-3xl sm:text-4xl mt-1">Relatórios</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Total: <span className="font-semibold text-foreground">{fmtBRL(total)}</span>
            {' · '}Mesas: <span className="font-semibold text-foreground">{fmtBRL(totalMesa)}</span>
            {' · '}Comandas: <span className="font-semibold text-foreground">{fmtBRL(totalComanda)}</span>
          </p>
        </div>
        <Tabs value={preset} onValueChange={(v) => applyPreset(v as RangePreset)}>
          <TabsList>
            <TabsTrigger value="7">7 dias</TabsTrigger>
            <TabsTrigger value="30">30 dias</TabsTrigger>
            <TabsTrigger value="90">90 dias</TabsTrigger>
            <TabsTrigger value="custom">Personalizado</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <div className="mb-6 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Data início</span>
          <Input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(e) => onStartChange(e.target.value)}
            className="w-44"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Data fim</span>
          <Input
            type="date"
            value={endDate}
            min={startDate}
            max={toLocalKey(new Date())}
            onChange={(e) => onEndChange(e.target.value)}
            className="w-44"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Origem</span>
          <Select value={origin} onValueChange={(v) => setOrigin(v as Origin)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="mesa">Mesas</SelectItem>
              <SelectItem value="comanda">Comandas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Forma de pagamento</span>
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              {methods.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Categoria</span>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
          <h3 className="font-display text-lg mb-4">Vendas por dia</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `R$${v}`} />
                <Tooltip formatter={(v: any) => fmtBRL(v as number)} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Line type="monotone" dataKey="total" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} />
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
                  {byMethod.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => fmtBRL(v as number)} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12, textTransform: 'capitalize' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-display text-lg mb-4">Por origem</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byOrigin} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
                  {byOrigin.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => fmtBRL(v as number)} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12, textTransform: 'capitalize' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
          <h3 className="font-display text-lg mb-4">Por categoria</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategory}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `R$${v}`} />
                <Tooltip formatter={(v: any) => fmtBRL(v as number)} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Bar dataKey="value" fill="var(--accent)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-3 rounded-xl border border-border bg-card p-5">
          <h3 className="font-display text-lg mb-4">Top produtos</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `R$${v}`} />
                <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={12} width={140} />
                <Tooltip formatter={(v: any) => fmtBRL(v as number)} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Bar dataKey="total" fill="var(--accent)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RelatoriosPage;
