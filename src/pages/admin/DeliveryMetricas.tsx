import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fmtBRL } from '@/lib/format';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Bike, Clock, Receipt, TrendingDown, TrendingUp } from 'lucide-react';

type Row = {
  id: string;
  status: string;
  service_mode: string;
  total: number;
  opened_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  driver_id: string | null;
};

const PERIODS = { 7: 'Últimos 7 dias', 30: 'Últimos 30 dias', 90: 'Últimos 90 dias' } as const;
type PeriodKey = keyof typeof PERIODS;

const STATUS_LABEL: Record<string, string> = {
  aguardando_aceite: 'Aguardando aceite',
  em_preparo: 'Em preparo',
  pronto: 'Pronto',
  em_entrega: 'Em entrega',
  entregue: 'Entregue',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
};

const minutesBetween = (a?: string | null, b?: string | null) =>
  a && b ? (new Date(b).getTime() - new Date(a).getTime()) / 60000 : null;

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const fmtMin = (m: number) => (m > 0 ? `${Math.round(m)} min` : '—');

async function fetchRows(companyId: string, since: Date) {
  const { data, error } = await supabase
    .from('orders')
    .select('id, status, service_mode, total, opened_at, accepted_at, ready_at, dispatched_at, delivered_at, driver_id')
    .eq('company_id', companyId)
    .eq('origin', 'digital_menu')
    .gte('opened_at', since.toISOString())
    .order('opened_at', { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data ?? []) as unknown as Row[];
}

function summarize(rows: Row[]) {
  const done = rows.filter((r) => ['entregue', 'fechado'].includes(r.status));
  const revenue = done.reduce((s, r) => s + Number(r.total || 0), 0);
  return {
    count: rows.length,
    completed: done.length,
    canceled: rows.filter((r) => ['cancelado', 'recusado'].includes(r.status)).length,
    revenue,
    ticket: done.length ? revenue / done.length : 0,
    acceptMin: avg(rows.map((r) => minutesBetween(r.opened_at, r.accepted_at)).filter((x): x is number => x !== null && x >= 0)),
    prepMin: avg(rows.map((r) => minutesBetween(r.accepted_at, r.ready_at)).filter((x): x is number => x !== null && x >= 0)),
    dispatchMin: avg(rows.map((r) => minutesBetween(r.ready_at, r.dispatched_at)).filter((x): x is number => x !== null && x >= 0)),
    routeMin: avg(rows.map((r) => minutesBetween(r.dispatched_at, r.delivered_at)).filter((x): x is number => x !== null && x >= 0)),
    totalMin: avg(rows.map((r) => minutesBetween(r.opened_at, r.delivered_at)).filter((x): x is number => x !== null && x >= 0)),
  };
}

export default function DeliveryMetricas() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const [days, setDays] = useState<PeriodKey>(30);

  useEffect(() => { document.title = 'Métricas do Delivery'; }, []);

  const since = useMemo(() => new Date(Date.now() - days * 86400_000), [days]);
  const prevSince = useMemo(() => new Date(Date.now() - days * 2 * 86400_000), [days]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['delivery-metrics', companyId, days],
    queryFn: () => fetchRows(companyId!, prevSince),
    enabled: !!companyId,
  });

  const current = useMemo(() => rows.filter((r) => new Date(r.opened_at) >= since), [rows, since]);
  const previous = useMemo(() => rows.filter((r) => new Date(r.opened_at) < since), [rows, since]);

  const cur = useMemo(() => summarize(current), [current]);
  const prev = useMemo(() => summarize(previous), [previous]);

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers-metrics', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('delivery_drivers').select('id, name').eq('company_id', companyId!);
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: !!companyId,
  });

  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    current.forEach((r) => map.set(r.status, (map.get(r.status) ?? 0) + 1));
    return Array.from(map, ([status, qtd]) => ({ status: STATUS_LABEL[status] ?? status, qtd }))
      .sort((a, b) => b.qtd - a.qtd);
  }, [current]);

  const byDriver = useMemo(() => {
    const map = new Map<string, { times: number[]; count: number }>();
    current.filter((r) => r.driver_id && r.delivered_at).forEach((r) => {
      const entry = map.get(r.driver_id!) ?? { times: [], count: 0 };
      const t = minutesBetween(r.dispatched_at, r.delivered_at);
      if (t !== null && t >= 0) entry.times.push(t);
      entry.count += 1;
      map.set(r.driver_id!, entry);
    });
    return Array.from(map, ([id, v]) => ({
      name: drivers.find((d) => d.id === id)?.name ?? 'Entregador',
      entregas: v.count,
      media: Math.round(avg(v.times)),
    })).sort((a, b) => b.entregas - a.entregas);
  }, [current, drivers]);

  if (!companyId) return null;

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 min-w-0">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Métricas do Delivery</h1>
          <p className="text-sm text-muted-foreground">Desempenho exclusivo dos pedidos do cardápio digital.</p>
        </div>
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v) as PeriodKey)}>
          <TabsList>
            {Object.entries(PERIODS).map(([k, label]) => (
              <TabsTrigger key={k} value={k}>{label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 min-w-0">
            <Metric icon={Receipt} label="Pedidos" value={String(cur.count)} delta={delta(cur.count, prev.count)} />
            <Metric icon={Bike} label="Faturamento concluído" value={fmtBRL(cur.revenue)} delta={delta(cur.revenue, prev.revenue)} />
            <Metric icon={Receipt} label="Ticket médio" value={fmtBRL(cur.ticket)} delta={delta(cur.ticket, prev.ticket)} />
            <Metric icon={Clock} label="Tempo total médio" value={fmtMin(cur.totalMin)} delta={delta(prev.totalMin, cur.totalMin)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2 min-w-0">
            <Card className="min-w-0">
              <CardHeader><CardTitle className="text-base">Volume por status</CardTitle></CardHeader>
              <CardContent className="min-w-0">
                {byStatus.length === 0 ? <Empty /> : (
                  <div className="h-64 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={byStatus} margin={{ left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="status" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="qtd" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader><CardTitle className="text-base">Tempo médio por etapa</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm min-w-0">
                <Stage label="Recebido → aceito" cur={cur.acceptMin} prev={prev.acceptMin} />
                <Stage label="Aceito → pronto" cur={cur.prepMin} prev={prev.prepMin} />
                <Stage label="Pronto → saída" cur={cur.dispatchMin} prev={prev.dispatchMin} />
                <Stage label="Saída → entregue" cur={cur.routeMin} prev={prev.routeMin} />
                <Stage label="Ciclo completo" cur={cur.totalMin} prev={prev.totalMin} bold />
                <div className="pt-2 text-xs text-muted-foreground">
                  {cur.completed} concluídos · {cur.canceled} cancelados/recusados
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="min-w-0">
            <CardHeader><CardTitle className="text-base">Desempenho por entregador</CardTitle></CardHeader>
            <CardContent className="min-w-0">
              {byDriver.length === 0 ? <Empty text="Nenhuma entrega atribuída no período." /> : (
                <ul className="divide-y">
                  {byDriver.map((d) => (
                    <li key={d.name} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-medium break-words">{d.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {d.entregas} entrega{d.entregas === 1 ? '' : 's'} · média de {d.media || '—'} min por rota
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function delta(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

function Metric({ icon: Icon, label, value, delta: d }: { icon: typeof Clock; label: string; value: string; delta: number | null }) {
  const up = (d ?? 0) >= 0;
  return (
    <Card className="min-w-0">
      <CardContent className="pt-6 min-w-0">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <div className="mt-1 text-2xl font-semibold break-words">{value}</div>
        {d !== null && (
          <div className={`mt-1 inline-flex items-center gap-1 text-xs ${up ? 'text-emerald-600' : 'text-red-600'}`}>
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(d).toFixed(1)}% vs período anterior
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stage({ label, cur, prev, bold }: { label: string; cur: number; prev: number; bold?: boolean }) {
  const diff = cur - prev;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 ${bold ? 'border-t pt-2 font-semibold' : ''}`}>
      <span className={bold ? '' : 'text-muted-foreground'}>{label}</span>
      <span className="tabular-nums">
        {fmtMin(cur)}
        {prev > 0 && cur > 0 && (
          <span className={`ml-2 text-xs ${diff <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {diff <= 0 ? '−' : '+'}{Math.abs(Math.round(diff))} min
          </span>
        )}
      </span>
    </div>
  );
}

function Empty({ text = 'Sem dados no período.' }: { text?: string }) {
  return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{text}</div>;
}
