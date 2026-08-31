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

type Origin = 'todas' | 'mesa' | 'comanda' | 'delivery';
type RangePreset = '7' | '30' | '90' | 'custom';
type ItemOrigin = 'mesa' | 'comanda' | 'delivery';

type DeliveryOrder = {
  id: string;
  total: number;
  delivery_fee: number;
  service_mode: string;
  payment_method: string | null;
  created_at: string;
};

/** Normaliza a forma de pagamento do cardápio digital para o padrão interno. */
const normalizeDeliveryMethod = (m: string | null): string => {
  switch (m) {
    case 'cartao_credito': return 'credito';
    case 'cartao_debito': return 'debito';
    case 'pix': return 'pix';
    case 'dinheiro': return 'dinheiro';
    default: return m ?? 'outros';
  }
};

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
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrder[]>([]);
  const [items, setItems] = useState<{ name: string; category: string; quantity: number; total: number; origin: ItemOrigin }[]>([]);
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

      const [paysRes, tabPaysRes, ordersRes, deliveryRes, tabItemsRes, prodRes, catRes] = await Promise.all([
        supabase.from('payments').select('amount, method, created_at').eq('company_id', cid).eq('status', 'ativo').gte('created_at', sinceISO).lte('created_at', untilISO),
        supabase.from('tab_payments').select('amount, method, created_at').eq('company_id', cid).eq('status', 'ativo').gte('created_at', sinceISO).lte('created_at', untilISO),
        supabase.from('orders').select('id, closed_at').eq('company_id', cid).neq('origin', 'digital_menu').eq('status', 'fechado').gte('closed_at', sinceISO).lte('closed_at', untilISO),
        supabase.from('orders')
          .select('id, total, delivery_fee, service_mode, payment_method, opened_at')
          .eq('company_id', cid).eq('origin', 'digital_menu')
          .in('status', ['entregue', 'fechado'])
          .gte('opened_at', sinceISO).lte('opened_at', untilISO),
        supabase.from('tab_items').select('product_name, category_name, quantity, total_price, created_at').eq('company_id', cid).is('canceled_at', null).gte('created_at', sinceISO).lte('created_at', untilISO),
        supabase.from('products').select('id, name, category_id').eq('company_id', cid),
        supabase.from('categories').select('id, name').eq('company_id', cid),
      ]);

      setOrderPays((paysRes.data ?? []).map((p: any) => ({ ...p, amount: Number(p.amount) })));
      setTabPays((tabPaysRes.data ?? []).map((p: any) => ({ ...p, amount: Number(p.amount) })));

      const deliveries: DeliveryOrder[] = (deliveryRes.data ?? []).map((o: any) => ({
        id: o.id,
        total: Number(o.total ?? 0),
        delivery_fee: Number(o.delivery_fee ?? 0),
        service_mode: o.service_mode ?? 'delivery',
        payment_method: o.payment_method ?? null,
        created_at: o.opened_at,
      }));
      setDeliveryOrders(deliveries);

      const catName = new Map<string, string>((catRes.data ?? []).map((c: any) => [c.id, c.name]));
      const prodMap = new Map<string, string>((prodRes.data ?? []).map((p: any) => [p.id, catName.get(p.category_id) ?? 'Outros']));

      const orderIds = (ordersRes.data ?? []).map((o: any) => o.id);
      const deliveryIds = deliveries.map((o) => o.id);
      const fetchItems = async (ids: string[]) => {
        if (!ids.length) return [] as any[];
        const { data } = await supabase.from('order_items')
          .select('product_name, product_id, quantity, total_price')
          .in('order_id', ids).is('canceled_at', null);
        return data ?? [];
      };
      const [oi, di] = await Promise.all([fetchItems(orderIds), fetchItems(deliveryIds)]);

      const mapItem = (i: any, o: ItemOrigin) => ({
        name: i.product_name as string,
        category: prodMap.get(i.product_id) ?? 'Outros',
        quantity: Number(i.quantity),
        total: Number(i.total_price),
        origin: o,
      });

      const allItems = [
        ...oi.map((i: any) => mapItem(i, 'mesa')),
        ...di.map((i: any) => mapItem(i, 'delivery')),
        ...(tabItemsRes.data ?? []).map((i: any) => ({
          name: i.product_name as string,
          category: i.category_name ?? 'Outros',
          quantity: Number(i.quantity),
          total: Number(i.total_price),
          origin: 'comanda',
        })),
      ];
      setItems(allItems);

      const cats = new Set<string>();
      allItems.forEach((i) => cats.add(i.category));
      setCategories(Array.from(cats).sort());
    })();
  }, [profile?.company_id, sinceISO, untilISO]);

  const deliveryPays = useMemo(
    () => deliveryOrders.map((o) => ({
      amount: o.total,
      method: normalizeDeliveryMethod(o.payment_method),
      created_at: o.created_at,
    })),
    [deliveryOrders],
  );

  const payments = useMemo(() => {
    const fromOrders = orderPays.map((p) => ({ ...p, origin: 'mesa' as ItemOrigin }));
    const fromTabs = tabPays.map((p) => ({ ...p, origin: 'comanda' as const }));
    const fromDelivery = deliveryPays.map((p) => ({ ...p, origin: 'delivery' as ItemOrigin }));
    let all = [...fromOrders, ...fromTabs, ...fromDelivery];
    if (origin !== 'todas') all = all.filter((p) => p.origin === origin);
    if (methodFilter !== 'todos') all = all.filter((p) => p.method === methodFilter);
    return all;
  }, [orderPays, tabPays, deliveryPays, origin, methodFilter]);

  const filteredItems = useMemo(() => {
    let all = items;
    if (origin !== 'todas') all = all.filter((i) => i.origin === origin);
    if (categoryFilter !== 'todas') all = all.filter((i) => i.category === categoryFilter);
    return all;
  }, [items, origin, categoryFilter]);

  const methods = useMemo(() => {
    const s = new Set<string>();
    [...orderPays, ...tabPays, ...deliveryPays].forEach((p) => s.add(p.method));
    return Array.from(s);
  }, [orderPays, tabPays, deliveryPays]);

  /** Métricas específicas do cardápio digital (Fase 5). */
  const delivery = useMemo(() => {
    const count = deliveryOrders.length;
    const revenue = deliveryOrders.reduce((s, o) => s + o.total, 0);
    const fees = deliveryOrders.reduce((s, o) => s + o.delivery_fee, 0);
    const entrega = deliveryOrders.filter((o) => o.service_mode === 'delivery');
    const retirada = deliveryOrders.filter((o) => o.service_mode !== 'delivery');
    const byMode = [
      { name: 'Entrega', value: entrega.reduce((s, o) => s + o.total, 0), qty: entrega.length },
      { name: 'Retirada', value: retirada.reduce((s, o) => s + o.total, 0), qty: retirada.length },
    ].filter((m) => m.qty > 0);
    const dailyMap = new Map<string, number>();
    for (const k of dayList) dailyMap.set(k, 0);
    for (const o of deliveryOrders) {
      const k = toLocalKey(new Date(o.created_at));
      if (dailyMap.has(k)) dailyMap.set(k, (dailyMap.get(k) ?? 0) + o.total);
    }
    const daily = Array.from(dailyMap.entries()).map(([d, v]) => {
      const [y, m, day] = d.split('-').map(Number);
      return { date: new Date(y, m - 1, day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), total: v };
    });
    const topMap = new Map<string, { qty: number; total: number }>();
    for (const i of items.filter((x) => x.origin === 'delivery')) {
      const cur = topMap.get(i.name) ?? { qty: 0, total: 0 };
      cur.qty += i.quantity; cur.total += i.total;
      topMap.set(i.name, cur);
    }
    const top = Array.from(topMap.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
    return { count, revenue, fees, ticket: count ? revenue / count : 0, byMode, daily, top };
  }, [deliveryOrders, items, dayList]);

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
  const totalDelivery = payments.filter((p) => p.origin === 'delivery').reduce((s, p) => s + p.amount, 0);

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
            {' · '}Delivery: <span className="font-semibold text-foreground">{fmtBRL(totalDelivery)}</span>
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
              <SelectItem value="delivery">Delivery / Cardápio digital</SelectItem>
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

      <section className="mt-10">
        <div className="mb-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Cardápio digital</p>
          <h2 className="font-display text-2xl mt-1">Delivery e retirada</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Pedidos concluídos originados do cardápio digital no período selecionado.
          </p>
        </div>

        {delivery.count === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Nenhum pedido de delivery concluído neste período.
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MiniStat label="Pedidos" value={String(delivery.count)} />
              <MiniStat label="Faturamento" value={fmtBRL(delivery.revenue)} />
              <MiniStat label="Ticket médio" value={fmtBRL(delivery.ticket)} />
              <MiniStat label="Taxas de entrega" value={fmtBRL(delivery.fees)} />
            </div>

            <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 min-w-0">
              <h3 className="font-display text-lg mb-4">Faturamento delivery por dia</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={delivery.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `R$${v}`} />
                    <Tooltip formatter={(v: any) => fmtBRL(v as number)} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }} />
                    <Line type="monotone" dataKey="total" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 min-w-0">
              <h3 className="font-display text-lg mb-4">Entrega x Retirada</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={delivery.byMode} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
                      {delivery.byMode.map((entry, i) => <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmtBRL(v as number)} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-3 rounded-xl border border-border bg-card p-5 min-w-0">
              <h3 className="font-display text-lg mb-4">Itens mais pedidos no delivery</h3>
              <ul className="divide-y divide-border">
                {delivery.top.map((p) => (
                  <li key={p.name} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm break-words min-w-0">{p.name}</span>
                    <span className="text-sm text-muted-foreground shrink-0">
                      {p.qty} un. · <span className="font-semibold text-foreground">{fmtBRL(p.total)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function MiniStat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 min-w-0">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl break-words">{value}</p>
    </div>
  );
}

export default RelatoriosPage;
