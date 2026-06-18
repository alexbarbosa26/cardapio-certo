import { Navigate, Link } from 'react-router-dom';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { fmtBRL } from '@/lib/format';
import {
  TrendingUp, UtensilsCrossed, Receipt, ClipboardList, CreditCard,
  Wallet, Target, Clock, Banknote, ChefHat, Package, AlertTriangle, Pencil,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/dashboard/StatCard';
import { Section, Panel } from '@/components/dashboard/Section';
import { RankingList } from '@/components/dashboard/RankingList';
import { MetaDialog } from '@/components/dashboard/MetaDialog';

const PIE_COLORS = ['var(--accent)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-2)'];

interface Payment {
  amount: number;
  method: string;
  fee_amount: number | null;
  net_amount: number | null;
  created_at: string;
  origin: 'mesa' | 'comanda';
}

interface ItemRow {
  name: string;
  category: string;
  quantity: number;
  total: number;
}

interface OpenRegister {
  id: string;
  opened_at: string;
  opening_amount: number;
}

interface MovementRow {
  id: string;
  type: 'suprimento' | 'sangria';
  amount: number;
  notes: string | null;
  created_at: string;
}

interface SalesGoal {
  id: string;
  target_amount: number;
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfMonth(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  return x;
}
function daysInMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return curr > 0 ? 100 : null;
  return ((curr - prev) / prev) * 100;
}

function DashboardPage() {
  const { profile } = useAuth();
  const redirectNonAdmin = !!profile && profile.role !== 'admin';

  const now = useMemo(() => new Date(), []);
  const today = useMemo(() => startOfDay(now), [now]);
  const yesterday = useMemo(() => {
    const x = new Date(today); x.setDate(x.getDate() - 1); return x;
  }, [today]);
  const monthStart = useMemo(() => startOfMonth(now), [now]);
  const prevMonthStart = useMemo(
    () => new Date(now.getFullYear(), now.getMonth() - 1, 1), [now],
  );

  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [closedOrdersToday, setClosedOrdersToday] = useState(0);
  const [closedOrdersYesterday, setClosedOrdersYesterday] = useState(0);
  const [mesasOcupadas, setMesasOcupadas] = useState(0);
  const [comandasAbertas, setComandasAbertas] = useState(0);
  const [items30d, setItems30d] = useState<ItemRow[]>([]);
  const [activeProducts, setActiveProducts] = useState<{ id: string; name: string }[]>([]);
  const [ordersByHour, setOrdersByHour] = useState<Map<number, number>>(new Map());
  const [register, setRegister] = useState<OpenRegister | null>(null);
  const [registerMovements, setRegisterMovements] = useState<MovementRow[]>([]);
  const [registerCashPayments, setRegisterCashPayments] = useState(0);
  const [goal, setGoal] = useState<SalesGoal | null>(null);
  const [metaOpen, setMetaOpen] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const cid = profile.company_id;
    const sinceItemsISO = (() => {
      const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0, 0, 0, 0);
      return d.toISOString();
    })();

    const [
      orderPaysRes, tabPaysRes,
      closedOrdersTodayRes, closedOrdersYestRes,
      openOrdersRes, openTabsRes,
      orderItems30Res, prodRes, catRes, tabItems30Res,
      activeProdRes,
      regRes, goalRes,
    ] = await Promise.all([
      supabase.from('payments')
        .select('amount, method, fee_amount, net_amount, created_at')
        .eq('company_id', cid).eq('status', 'ativo')
        .gte('created_at', prevMonthStart.toISOString()),
      supabase.from('tab_payments')
        .select('amount, method, fee_amount, net_amount, created_at')
        .eq('company_id', cid).eq('status', 'ativo')
        .gte('created_at', prevMonthStart.toISOString()),
      supabase.from('orders').select('id, closed_at')
        .eq('company_id', cid).eq('status', 'fechado')
        .gte('closed_at', today.toISOString()),
      supabase.from('orders').select('id', { count: 'exact', head: true })
        .eq('company_id', cid).eq('status', 'fechado')
        .gte('closed_at', yesterday.toISOString())
        .lt('closed_at', today.toISOString()),
      supabase.from('orders').select('id, table_id')
        .eq('company_id', cid).eq('status', 'aberto'),
      supabase.from('customer_tabs').select('id', { count: 'exact', head: true })
        .eq('company_id', cid).eq('status', 'aberta'),
      supabase.from('orders').select('id, closed_at')
        .eq('company_id', cid).eq('status', 'fechado')
        .gte('closed_at', sinceItemsISO),
      supabase.from('products').select('id, name, category_id, status').eq('company_id', cid),
      supabase.from('categories').select('id, name').eq('company_id', cid),
      supabase.from('tab_items')
        .select('product_name, category_name, quantity, total_price, created_at')
        .eq('company_id', cid).is('canceled_at', null)
        .gte('created_at', sinceItemsISO),
      supabase.from('products').select('id, name')
        .eq('company_id', cid).eq('status', 'ativo'),
      supabase.from('cash_registers').select('id, opened_at, opening_amount')
        .eq('company_id', cid).eq('status', 'aberto')
        .order('opened_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('sales_goals').select('id, target_amount')
        .eq('company_id', cid)
        .eq('year', now.getFullYear()).eq('month', now.getMonth() + 1)
        .maybeSingle(),
    ]);

    const allPays: Payment[] = [
      ...((orderPaysRes.data ?? []) as any[]).map((p) => ({
        amount: Number(p.amount),
        method: String(p.method ?? 'outros'),
        fee_amount: p.fee_amount != null ? Number(p.fee_amount) : null,
        net_amount: p.net_amount != null ? Number(p.net_amount) : null,
        created_at: p.created_at,
        origin: 'mesa' as const,
      })),
      ...((tabPaysRes.data ?? []) as any[]).map((p) => ({
        amount: Number(p.amount),
        method: String(p.method ?? 'outros'),
        fee_amount: p.fee_amount != null ? Number(p.fee_amount) : null,
        net_amount: p.net_amount != null ? Number(p.net_amount) : null,
        created_at: p.created_at,
        origin: 'comanda' as const,
      })),
    ];
    setPayments(allPays);

    setClosedOrdersToday((closedOrdersTodayRes.data ?? []).length);
    setClosedOrdersYesterday(closedOrdersYestRes.count ?? 0);
    setMesasOcupadas(new Set((openOrdersRes.data ?? []).map((o: any) => o.table_id)).size);
    setComandasAbertas(openTabsRes.count ?? 0);

    // ===== Itens últimos 30 dias =====
    const catName = new Map<string, string>((catRes.data ?? []).map((c: any) => [c.id, c.name]));
    const prodCat = new Map<string, string>((prodRes.data ?? []).map((p: any) => [p.id, catName.get(p.category_id) ?? 'Outros']));
    const orderIds = (orderItems30Res.data ?? []).map((o: any) => o.id);
    let oi: any[] = [];
    if (orderIds.length) {
      const { data } = await supabase
        .from('order_items')
        .select('product_id, product_name, quantity, total_price')
        .in('order_id', orderIds).is('canceled_at', null);
      oi = data ?? [];
    }
    const allItems: ItemRow[] = [
      ...oi.map((i: any) => ({
        name: i.product_name as string,
        category: prodCat.get(i.product_id) ?? 'Outros',
        quantity: Number(i.quantity),
        total: Number(i.total_price),
      })),
      ...((tabItems30Res.data ?? []) as any[]).map((i) => ({
        name: i.product_name as string,
        category: i.category_name ?? 'Outros',
        quantity: Number(i.quantity),
        total: Number(i.total_price),
      })),
    ];
    setItems30d(allItems);
    setActiveProducts((activeProdRes.data ?? []) as { id: string; name: string }[]);

    // ===== Pedidos por hora (hoje) =====
    const hourMap = new Map<number, number>();
    for (const o of (closedOrdersTodayRes.data ?? []) as any[]) {
      const h = new Date(o.closed_at).getHours();
      hourMap.set(h, (hourMap.get(h) ?? 0) + 1);
    }
    setOrdersByHour(hourMap);

    // ===== Caixa aberto =====
    const reg = regRes.data
      ? {
          id: regRes.data.id,
          opened_at: regRes.data.opened_at,
          opening_amount: Number(regRes.data.opening_amount ?? 0),
        }
      : null;
    setRegister(reg);
    if (reg) {
      const [movRes, cashPayRes, cashTabPayRes] = await Promise.all([
        supabase.from('cash_movements')
          .select('id, type, amount, notes, created_at')
          .eq('register_id', reg.id).order('created_at', { ascending: false }),
        supabase.from('payments').select('amount')
          .eq('company_id', cid).eq('register_id', reg.id)
          .eq('status', 'ativo').eq('method', 'dinheiro'),
        supabase.from('tab_payments').select('amount')
          .eq('company_id', cid).eq('register_id', reg.id)
          .eq('status', 'ativo').eq('method', 'dinheiro'),
      ]);
      setRegisterMovements(
        ((movRes.data ?? []) as any[]).map((m) => ({
          id: m.id, type: m.type, amount: Number(m.amount),
          notes: m.notes, created_at: m.created_at,
        })),
      );
      const cashSum =
        ((cashPayRes.data ?? []) as any[]).reduce((s, p) => s + Number(p.amount), 0) +
        ((cashTabPayRes.data ?? []) as any[]).reduce((s, p) => s + Number(p.amount), 0);
      setRegisterCashPayments(cashSum);
    } else {
      setRegisterMovements([]);
      setRegisterCashPayments(0);
    }

    setGoal(goalRes.data ?? null);
    setLoading(false);
  }, [profile, today, yesterday, prevMonthStart, now]);

  useEffect(() => { void load(); }, [load]);

  // ===== Cálculos =====
  const todayPays = useMemo(
    () => payments.filter((p) => new Date(p.created_at) >= today),
    [payments, today],
  );
  const yesterdayPays = useMemo(
    () => payments.filter((p) => {
      const d = new Date(p.created_at);
      return d >= yesterday && d < today;
    }),
    [payments, yesterday, today],
  );
  const monthPays = useMemo(
    () => payments.filter((p) => new Date(p.created_at) >= monthStart),
    [payments, monthStart],
  );
  const prevMonthPays = useMemo(
    () => payments.filter((p) => {
      const d = new Date(p.created_at);
      return d >= prevMonthStart && d < monthStart;
    }),
    [payments, prevMonthStart, monthStart],
  );

  const sum = (arr: Payment[]) => arr.reduce((s, p) => s + p.amount, 0);
  const vendasHoje = sum(todayPays);
  const vendasOntem = sum(yesterdayPays);
  const vendasMes = sum(monthPays);
  const vendasMesAnt = sum(prevMonthPays);
  const vendasMesa = sum(todayPays.filter((p) => p.origin === 'mesa'));
  const vendasComanda = sum(todayPays.filter((p) => p.origin === 'comanda'));
  const ticketMedio = closedOrdersToday > 0 ? vendasHoje / closedOrdersToday : 0;

  // ===== Produtos / categorias (30d) =====
  const topByRevenue = useMemo(() => {
    const map = new Map<string, { qty: number; total: number }>();
    for (const i of items30d) {
      const cur = map.get(i.name) ?? { qty: 0, total: 0 };
      cur.qty += i.quantity; cur.total += i.total;
      map.set(i.name, cur);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total).slice(0, 10);
  }, [items30d]);

  const topByQty = useMemo(() => {
    const map = new Map<string, { qty: number; total: number }>();
    for (const i of items30d) {
      const cur = map.get(i.name) ?? { qty: 0, total: 0 };
      cur.qty += i.quantity; cur.total += i.total;
      map.set(i.name, cur);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [items30d]);

  const topCategories = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of items30d) map.set(i.category, (map.get(i.category) ?? 0) + i.total);
    return Array.from(map.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total).slice(0, 8);
  }, [items30d]);

  const lowTurnover = useMemo(() => {
    const sold = new Map<string, number>();
    for (const i of items30d) sold.set(i.name, (sold.get(i.name) ?? 0) + i.quantity);
    return activeProducts
      .map((p) => ({ name: p.name, qty: sold.get(p.name) ?? 0 }))
      .filter((p) => p.qty <= 1)
      .sort((a, b) => a.qty - b.qty)
      .slice(0, 10);
  }, [items30d, activeProducts]);

  // ===== Horários de pico (hoje) =====
  const hourly = useMemo(() => {
    const sales = new Array(24).fill(0);
    for (const p of todayPays) sales[new Date(p.created_at).getHours()] += p.amount;
    return Array.from({ length: 24 }, (_, h) => ({
      hour: `${String(h).padStart(2, '0')}h`,
      vendas: sales[h],
      pedidos: ordersByHour.get(h) ?? 0,
    }));
  }, [todayPays, ordersByHour]);

  const bestHour = useMemo(() => {
    let bestIdx = -1; let bestVal = 0;
    hourly.forEach((h, i) => { if (h.vendas > bestVal) { bestVal = h.vendas; bestIdx = i; } });
    return bestIdx >= 0 ? hourly[bestIdx] : null;
  }, [hourly]);

  // ===== Formas de pagamento (hoje) =====
  const byMethod = useMemo(() => {
    const map = new Map<string, { gross: number; net: number; fee: number }>();
    for (const p of todayPays) {
      const cur = map.get(p.method) ?? { gross: 0, net: 0, fee: 0 };
      cur.gross += p.amount;
      cur.fee += p.fee_amount ?? 0;
      cur.net += p.net_amount ?? p.amount - (p.fee_amount ?? 0);
      map.set(p.method, cur);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.gross - a.gross);
  }, [todayPays]);

  const totalMethods = byMethod.reduce((s, m) => s + m.gross, 0);

  // ===== Caixa =====
  const movInflow = registerMovements
    .filter((m) => m.type === 'suprimento').reduce((s, m) => s + m.amount, 0);
  const movOutflow = registerMovements
    .filter((m) => m.type === 'sangria').reduce((s, m) => s + m.amount, 0);
  const expectedCash = register
    ? register.opening_amount + registerCashPayments + movInflow - movOutflow
    : 0;

  // ===== Metas =====
  const target = goal?.target_amount ?? 0;
  const dim = daysInMonth(now);
  const dayOfMonth = now.getDate();
  const progressPct = target > 0 ? Math.min(100, (vendasMes / target) * 100) : 0;
  const avgPerDay = dayOfMonth > 0 ? vendasMes / dayOfMonth : 0;
  const projection = avgPerDay * dim;
  const daysLeft = Math.max(0, dim - dayOfMonth);
  const remaining = Math.max(0, target - vendasMes);
  const neededPerDay = daysLeft > 0 ? remaining / daysLeft : remaining;

  const deltaHoje = pctDelta(vendasHoje, vendasOntem);
  const deltaMes = pctDelta(vendasMes, vendasMesAnt);
  const deltaPedidos = pctDelta(closedOrdersToday, closedOrdersYesterday);

  if (redirectNonAdmin) return <Navigate to="/mesas" />;

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Visão estratégica</p>
        <h1 className="font-display text-3xl sm:text-4xl mt-1">Painel do Dono</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Olá, {profile?.name}. Acompanhe os indicadores da sua operação em tempo real.
        </p>
      </header>

      {/* ===== Resumo financeiro ===== */}
      <Section title="Resumo financeiro" description="Indicadores de hoje e da operação atual.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Vendas de hoje" value={fmtBRL(vendasHoje)} icon={TrendingUp} accent
            delta={deltaHoje} deltaLabel="vs ontem"
          />
          <StatCard
            label="Vendas do mês" value={fmtBRL(vendasMes)} icon={Wallet}
            delta={deltaMes} deltaLabel="vs mês anterior"
          />
          <StatCard
            label="Ticket médio" value={fmtBRL(ticketMedio)} icon={CreditCard}
            hint={`${closedOrdersToday} pedido(s) hoje`}
          />
          <StatCard
            label="Pedidos finalizados" value={String(closedOrdersToday)} icon={Receipt}
            delta={deltaPedidos} deltaLabel="vs ontem"
          />
          <StatCard label="Vendas por mesas" value={fmtBRL(vendasMesa)} icon={UtensilsCrossed} />
          <StatCard label="Vendas por comandas" value={fmtBRL(vendasComanda)} icon={ClipboardList} />
          <StatCard label="Mesas ocupadas" value={String(mesasOcupadas)} icon={UtensilsCrossed} />
          <StatCard label="Comandas abertas" value={String(comandasAbertas)} icon={ClipboardList} />
        </div>
      </Section>

      {/* ===== Metas ===== */}
      <Section
        title="Meta do mês"
        description="Defina e acompanhe o objetivo de faturamento mensal."
        action={
          <Button variant="outline" size="sm" onClick={() => setMetaOpen(true)}>
            <Pencil className="h-4 w-4 mr-2" />
            {target > 0 ? 'Editar meta' : 'Definir meta'}
          </Button>
        }
      >
        <Panel>
          {target <= 0 ? (
            <div className="text-center py-6">
              <Target className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Você ainda não definiu uma meta para este mês.
              </p>
              <Button onClick={() => setMetaOpen(true)} className="mt-3 bg-primary">
                Definir meta agora
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-end flex-wrap gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Progresso</p>
                  <p className="font-display text-2xl tabular-nums">
                    {fmtBRL(vendasMes)} <span className="text-muted-foreground text-base">/ {fmtBRL(target)}</span>
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{progressPct.toFixed(1)}%</span>
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="grid sm:grid-cols-3 gap-3 pt-2">
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Projeção do mês</p>
                  <p className="font-display text-lg tabular-nums">{fmtBRL(projection)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Falta para a meta</p>
                  <p className="font-display text-lg tabular-nums">{fmtBRL(remaining)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">
                    Por dia ({daysLeft} dia{daysLeft === 1 ? '' : 's'} restantes)
                  </p>
                  <p className="font-display text-lg tabular-nums">{fmtBRL(neededPerDay)}</p>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </Section>

      {/* ===== Horários de pico ===== */}
      <Section
        title="Horários de pico"
        description={bestHour && bestHour.vendas > 0
          ? `Melhor horário de hoje: ${bestHour.hour} com ${fmtBRL(bestHour.vendas)}.`
          : 'Distribuição de vendas e pedidos ao longo do dia.'}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Vendas por hora (hoje)">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="hour" stroke="var(--muted-foreground)" fontSize={11} interval={1} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => `R$${v}`} />
                  <Tooltip
                    formatter={(v: any) => fmtBRL(v as number)}
                    contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }}
                  />
                  <Bar dataKey="vendas" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel title="Pedidos por hora (hoje)">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hourly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="hour" stroke="var(--muted-foreground)" fontSize={11} interval={1} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }}
                  />
                  <Line type="monotone" dataKey="pedidos" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      </Section>

      {/* ===== Produtos e categorias ===== */}
      <Section
        title="Produtos e categorias"
        description="Desempenho dos últimos 30 dias."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Top 10 produtos por faturamento">
            <RankingList
              items={topByRevenue.map((p, _i, arr) => ({
                name: p.name,
                primary: fmtBRL(p.total),
                secondary: `${p.qty} un.`,
                ratio: arr[0].total ? p.total / arr[0].total : 0,
              }))}
            />
          </Panel>
          <Panel title="Top 10 produtos por quantidade">
            <RankingList
              items={topByQty.map((p, _i, arr) => ({
                name: p.name,
                primary: `${p.qty} un.`,
                secondary: fmtBRL(p.total),
                ratio: arr[0].qty ? p.qty / arr[0].qty : 0,
              }))}
            />
          </Panel>
          <Panel title="Top categorias por faturamento">
            <RankingList
              items={topCategories.map((c, _i, arr) => ({
                name: c.name,
                primary: fmtBRL(c.total),
                ratio: arr[0].total ? c.total / arr[0].total : 0,
              }))}
            />
          </Panel>
          <Panel title="Produtos com baixo giro (≤1 un. em 30d)">
            {lowTurnover.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                Todos os produtos ativos tiveram saída no período.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {lowTurnover.map((p) => (
                  <li key={p.name} className="py-2 flex justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      {p.name}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {p.qty === 0 ? 'sem venda' : `${p.qty} un.`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </Section>

      {/* ===== Formas de pagamento ===== */}
      <Section title="Formas de pagamento" description="Distribuição das vendas de hoje.">
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Participação" className="lg:col-span-1">
            <div className="h-64">
              {byMethod.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">Sem vendas hoje.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byMethod} dataKey="gross" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
                      {byMethod.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      formatter={(v: any) => fmtBRL(v as number)}
                      contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, textTransform: 'capitalize' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </Panel>
          <Panel title="Detalhamento" className="lg:col-span-2">
            {byMethod.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Sem vendas hoje.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                    <tr>
                      <th className="text-left py-2 font-medium">Forma</th>
                      <th className="text-right py-2 font-medium">Bruto</th>
                      <th className="text-right py-2 font-medium">Taxa</th>
                      <th className="text-right py-2 font-medium">Líquido</th>
                      <th className="text-right py-2 font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byMethod.map((m) => (
                      <tr key={m.name} className="border-b border-border/50 last:border-0">
                        <td className="py-2 capitalize font-medium">{m.name}</td>
                        <td className="py-2 text-right tabular-nums">{fmtBRL(m.gross)}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {m.fee > 0 ? `-${fmtBRL(m.fee)}` : '—'}
                        </td>
                        <td className="py-2 text-right tabular-nums">{fmtBRL(m.net)}</td>
                        <td className="py-2 text-right tabular-nums">
                          {totalMethods > 0 ? ((m.gross / totalMethods) * 100).toFixed(1) : '0.0'}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </Section>

      {/* ===== Caixa ===== */}
      <Section
        title="Caixa"
        description={register ? 'Status do caixa aberto no momento.' : 'Nenhum caixa aberto no momento.'}
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/caixa">
              <Banknote className="h-4 w-4 mr-2" /> Ir para caixa
            </Link>
          </Button>
        }
      >
        {register ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Resumo">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Aberto em</dt>
                  <dd className="tabular-nums">
                    {new Date(register.opened_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Abertura</dt>
                  <dd className="tabular-nums">{fmtBRL(register.opening_amount)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Vendas em dinheiro</dt>
                  <dd className="tabular-nums">{fmtBRL(registerCashPayments)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Suprimentos</dt>
                  <dd className="tabular-nums text-emerald-600 dark:text-emerald-400">
                    +{fmtBRL(movInflow)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Sangrias</dt>
                  <dd className="tabular-nums text-rose-600 dark:text-rose-400">
                    -{fmtBRL(movOutflow)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-border pt-2 mt-2">
                  <dt className="font-medium">Valor esperado</dt>
                  <dd className="font-display text-lg tabular-nums">{fmtBRL(expectedCash)}</dd>
                </div>
              </dl>
            </Panel>
            <Panel title="Movimentações" className="lg:col-span-2">
              {registerMovements.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nenhuma movimentação registrada.</p>
              ) : (
                <ul className="divide-y divide-border max-h-72 overflow-y-auto">
                  {registerMovements.map((m) => (
                    <li key={m.id} className="py-2 flex justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="capitalize font-medium">{m.type}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          {m.notes ? ` · ${m.notes}` : ''}
                        </p>
                      </div>
                      <span
                        className={`tabular-nums font-medium whitespace-nowrap ${
                          m.type === 'suprimento'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {m.type === 'suprimento' ? '+' : '-'}{fmtBRL(m.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        ) : (
          <Panel>
            <div className="text-center py-6">
              <Wallet className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Abra um caixa para acompanhar entradas, saídas e diferença em tempo real.
              </p>
            </div>
          </Panel>
        )}
      </Section>

      {/* ===== Atalhos ===== */}
      <Section title="Atalhos" description="Vá direto para a operação.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLink to="/mesas" icon={UtensilsCrossed} title="Mesas" desc="Operação e fechamento." />
          <QuickLink to="/comandas" icon={ClipboardList} title="Comandas" desc="PDV simplificado." />
          <QuickLink to="/cozinha" icon={ChefHat} title="Cozinha" desc="Pedidos pendentes." />
          <QuickLink to="/relatorios" icon={Package} title="Relatórios" desc="Histórico e filtros." />
        </div>
      </Section>

      {loading && (
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Clock className="inline h-3 w-3 mr-1" /> Atualizando indicadores...
        </p>
      )}

      {profile && (
        <MetaDialog
          open={metaOpen}
          onOpenChange={setMetaOpen}
          companyId={profile.company_id}
          year={now.getFullYear()}
          month={now.getMonth() + 1}
          initialValue={target}
          onSaved={load}
        />
      )}
    </div>
  );
}

function QuickLink({ to, icon: Icon, title, desc }: { to: string; icon: any; title: string; desc: string }) {
  return (
    <Link to={to} className="group rounded-2xl border border-border bg-card p-6 hover:border-accent transition shadow-card">
      <Icon className="h-5 w-5 text-accent" />
      <h3 className="mt-3 font-display text-xl">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{desc}</p>
    </Link>
  );
}

// Mantém o nome de export para compatibilidade com src/App.tsx
export default DashboardPage;
