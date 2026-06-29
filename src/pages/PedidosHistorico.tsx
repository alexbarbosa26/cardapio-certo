import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { BusyButton } from '@/components/busy-button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { fmtBRL, fmtDateTime } from '@/lib/format';
import { toast } from 'sonner';

type OrderStatus = 'aberto' | 'fechado' | 'cancelado';

interface OrderRow {
  id: string;
  order_number: number;
  status: OrderStatus;
  total: number;
  paid_amount: number;
  customer_name: string | null;
  opened_at: string;
  closed_at: string | null;
  canceled_at: string | null;
  cancellation_reason: string | null;
  table_id: string;
  user_id: string | null;
  table_name?: string;
  opened_by_name?: string;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  aberto: 'Aberto', fechado: 'Fechado', cancelado: 'Cancelado',
};
const STATUS_TONE: Record<OrderStatus, string> = {
  aberto: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  fechado: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  cancelado: 'bg-rose-500/10 text-rose-600 border-rose-500/30',
};

export default function PedidosHistorico() {
  const { profile, loading } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [busy, setBusy] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState<'todos' | OrderStatus>('todos');
  const [search, setSearch] = useState('');

  const [cancelOrder, setCancelOrder] = useState<OrderRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const load = async () => {
    if (!profile?.company_id) return;
    setBusy(true);
    let q = supabase
      .from('orders')
      .select('id, order_number, status, total, paid_amount, customer_name, opened_at, closed_at, canceled_at, cancellation_reason, table_id, opened_by, tables(name)')
      .eq('company_id', profile.company_id)
      .gte('opened_at', `${from}T00:00:00`)
      .lte('opened_at', `${to}T23:59:59`)
      .order('opened_at', { ascending: false })
      .limit(500);
    if (status !== 'todos') q = q.eq('status', status);
    const { data, error } = await q;
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const list = (data ?? []) as any[];
    const ids = Array.from(new Set(list.map((r) => r.opened_by).filter(Boolean)));
    let names: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      names = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.full_name]));
    }
    setRows(list.map((r: any) => ({
      ...r,
      table_name: r.tables?.name ?? '—',
      opened_by_name: r.opened_by ? (names[r.opened_by] ?? '—') : '—',
    })));
  };

  useEffect(() => {
    if (profile?.company_id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id, from, to, status]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      String(r.order_number).includes(s)
      || (r.customer_name ?? '').toLowerCase().includes(s)
      || (r.table_name ?? '').toLowerCase().includes(s)
      || (r.opened_by_name ?? '').toLowerCase().includes(s)
    );
  }, [rows, search]);

  const cancelAdmin = async () => {
    if (!cancelOrder) return;
    const reason = cancelReason.trim();
    if (reason.length < 4) { toast.error('Informe o motivo do cancelamento.'); return; }
    const { error } = await supabase.from('orders').update({
      status: 'cancelado',
      canceled_at: new Date().toISOString(),
      canceled_by: profile?.id,
      cancellation_reason: reason,
    }).eq('id', cancelOrder.id);
    if (error) { toast.error(error.message); return; }
    // Libera mesa se ainda estiver ocupada por este pedido
    await supabase.from('tables').update({ status: 'livre' }).eq('id', cancelOrder.table_id);
    toast.success('Pedido cancelado (auditado).');
    setCancelOrder(null); setCancelReason('');
    load();
  };

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl md:text-4xl">Histórico de pedidos</h1>
        <p className="text-sm text-muted-foreground">Auditoria completa dos pedidos das mesas. Acesso restrito a administradores.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div><Label>De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="aberto">Aberto</SelectItem>
                <SelectItem value="fechado">Fechado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Buscar (mesa, cliente, atendente, #)</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ex.: João, mesa 5, 1024" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Pedidos ({filtered.length})</CardTitle>
          <Button variant="outline" size="sm" onClick={load} disabled={busy}>Atualizar</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground border-b">
              <tr className="text-left">
                <th className="py-2 pr-2">Data/hora</th>
                <th className="py-2 pr-2">Mesa</th>
                <th className="py-2 pr-2">Cliente</th>
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Atendente</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2 pr-2 text-right">Total</th>
                <th className="py-2 pr-2 text-right">Pago</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 pr-2 whitespace-nowrap">{fmtDateTime(r.opened_at)}</td>
                  <td className="py-2 pr-2">{r.table_name}</td>
                  <td className="py-2 pr-2">{r.customer_name ?? '—'}</td>
                  <td className="py-2 pr-2 tabular-nums">{r.order_number}</td>
                  <td className="py-2 pr-2">{r.opened_by_name}</td>
                  <td className="py-2 pr-2">
                    <Badge variant="outline" className={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    {r.cancellation_reason && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">Motivo: {r.cancellation_reason}</div>
                    )}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">{fmtBRL(r.total)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{fmtBRL(r.paid_amount)}</td>
                  <td className="py-2 text-right">
                    {r.status !== 'cancelado' && (
                      <Button size="sm" variant="outline" onClick={() => { setCancelOrder(r); setCancelReason(''); }}>
                        Cancelar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Nenhum pedido encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!cancelOrder} onOpenChange={(o) => !o && setCancelOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar pedido administrativamente</DialogTitle>
            <DialogDescription>
              Pedido #{cancelOrder?.order_number} · Mesa {cancelOrder?.table_name} · Total {fmtBRL(cancelOrder?.total ?? 0)}.
              Esta ação é auditada e não remove o registro do banco.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Motivo *</Label>
            <Textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ex.: pedido lançado em mesa errada" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOrder(null)}>Voltar</Button>
            <BusyButton onClick={cancelAdmin} busyText="Cancelando…">Confirmar cancelamento</BusyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
