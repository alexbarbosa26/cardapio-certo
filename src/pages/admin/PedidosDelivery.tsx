import { groupItems } from '@/lib/group-items';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { fmtBRL, fmtDateTime } from '@/lib/format';
import { PAYMENT_LABELS, type PaymentMethod } from '@/lib/digital-menu-cart';
import { fetchDrivers, type Driver } from '@/components/delivery/DriversTab';
import { buildStatusMessage, etaLabel, NOTIFIABLE, openWhatsapp, publicTrackUrl } from '@/lib/delivery-notify';
import {
  Bike, ChefHat, CheckCircle2, MessageCircle, PackageCheck, Phone, Truck, XCircle, Volume2, VolumeX, Ban,
} from 'lucide-react';

type OrderRow = {
  id: string;
  order_number: number;
  status: string;
  service_mode: string;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: DeliveryAddress | null;
  payment_method: string | null;
  payment_status: string | null;
  change_for: number | null;
  customer_notes: string | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  opened_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  estimated_minutes: number | null;
  rejection_reason: string | null;
  cancellation_reason: string | null;
  driver_id: string | null;
  public_token: string;
};

const STATUS_META: Record<string, { label: string; tone: string }> = {
  aguardando_aceite: { label: 'Aguardando aceite', tone: 'bg-amber-100 text-amber-900' },
  em_preparo: { label: 'Em preparo', tone: 'bg-blue-100 text-blue-900' },
  pronto: { label: 'Pronto', tone: 'bg-emerald-100 text-emerald-900' },
  em_entrega: { label: 'Em entrega', tone: 'bg-indigo-100 text-indigo-900' },
  entregue: { label: 'Entregue', tone: 'bg-neutral-200 text-neutral-800' },
  recusado: { label: 'Recusado', tone: 'bg-red-100 text-red-900' },
  cancelado: { label: 'Cancelado', tone: 'bg-neutral-200 text-neutral-700' },
};

const PAYMENT_STATUS_META: Record<string, { label: string; tone: string }> = {
  pendente: { label: 'Pagamento pendente', tone: 'bg-amber-100 text-amber-900' },
  pago: { label: 'Pago', tone: 'bg-emerald-100 text-emerald-900' },
  estornado: { label: 'Estornado', tone: 'bg-red-100 text-red-900' },
};

const ACTIVE_STATUSES = new Set(['aguardando_aceite', 'em_preparo', 'pronto', 'em_entrega']);
const SELECT_COLS =
  'id, order_number, status, service_mode, customer_name, customer_phone, delivery_address, payment_method, payment_status, change_for, customer_notes, subtotal, delivery_fee, total, opened_at, accepted_at, ready_at, dispatched_at, delivered_at, estimated_minutes, rejection_reason, cancellation_reason, driver_id, public_token';

async function fetchDeliveryOrders(companyId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select(SELECT_COLS)
    .eq('company_id', companyId)
    .eq('origin', 'digital_menu')
    .order('opened_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as OrderRow[];
}

async function fetchOrderItems(orderId: string) {
  const { data, error } = await supabase
    .from('order_items')
    .select('id, product_name, quantity, unit_price, total_price, notes, kitchen_status')
    .eq('order_id', orderId)
    .order('created_at');
  if (error) throw error;
  return data ?? [];
}

function playBell() {
  try {
    const ctx = new (globalThis.AudioContext || (globalThis as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
    o.start(); o.stop(ctx.currentTime + 0.95);
  } catch { /* ignore */ }
}

export default function PedidosDelivery() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const qc = useQueryClient();
  const [tab, setTab] = useState<'ativos' | 'aguardando_aceite' | 'em_preparo' | 'pronto' | 'em_entrega' | 'finalizados'>('ativos');
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [reasonDialog, setReasonDialog] = useState<{ order: OrderRow; next: 'recusado' | 'cancelado' } | null>(null);
  const [reason, setReason] = useState('');
  const [estimate, setEstimate] = useState<string>('30');
  const [soundOn, setSoundOn] = useState<boolean>(() => localStorage.getItem('mc:delivery:sound') !== '0');
  const [autoWa, setAutoWa] = useState<boolean>(() => localStorage.getItem('mc:delivery:autowa') === '1');
  const lastPendingCount = useRef<number | null>(null);

  useEffect(() => { document.title = 'Pedidos Delivery'; }, []);
  useEffect(() => { localStorage.setItem('mc:delivery:sound', soundOn ? '1' : '0'); }, [soundOn]);
  useEffect(() => { localStorage.setItem('mc:delivery:autowa', autoWa ? '1' : '0'); }, [autoWa]);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['delivery-orders', companyId],
    queryFn: () => fetchDeliveryOrders(companyId!),
    enabled: !!companyId,
    refetchInterval: 20_000,
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['delivery-drivers', companyId],
    queryFn: () => fetchDrivers(companyId!),
    enabled: !!companyId,
  });

  const { data: slug } = useQuery({
    queryKey: ['company-slug', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('digital_menu_slug').eq('id', companyId!).maybeSingle();
      return data?.digital_menu_slug ?? null;
    },
    enabled: !!companyId,
  });

  useEffect(() => {
    if (!companyId) return;
    const ch = supabase
      .channel(`delivery-orders-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `company_id=eq.${companyId}` }, () => {
        qc.invalidateQueries({ queryKey: ['delivery-orders', companyId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, qc]);

  const pending = useMemo(() => orders.filter((o) => o.status === 'aguardando_aceite').length, [orders]);

  useEffect(() => {
    if (lastPendingCount.current !== null && pending > lastPendingCount.current && soundOn) playBell();
    lastPendingCount.current = pending;
  }, [pending, soundOn]);

  const filtered = useMemo(() => {
    if (tab === 'ativos') return orders.filter((o) => ACTIVE_STATUSES.has(o.status));
    if (tab === 'finalizados') return orders.filter((o) => ['entregue', 'recusado', 'cancelado', 'fechado'].includes(o.status));
    return orders.filter((o) => o.status === tab);
  }, [orders, tab]);

  const driverName = (id: string | null) => drivers.find((d) => d.id === id)?.name ?? null;

  function notify(order: OrderRow, status: string, extra: { reason?: string; estimated?: number } = {}) {
    if (!NOTIFIABLE.has(status)) return;
    const msg = buildStatusMessage({
      order_number: order.order_number,
      customer_name: order.customer_name,
      service_mode: order.service_mode,
      status,
      estimated_minutes: extra.estimated ?? order.estimated_minutes,
      reason: extra.reason ?? null,
      driver_name: driverName(order.driver_id),
      track_url: publicTrackUrl(slug, order.public_token),
    });
    if (!openWhatsapp(order.customer_phone, msg)) toast.warning('Telefone do cliente inválido para WhatsApp.');
  }

  async function updateStatus(order: OrderRow, next: string, opts: { reason?: string; estimated?: number } = {}) {
    const { error } = await supabase.rpc('admin_update_delivery_order_status', {
      _order_id: order.id,
      _new_status: next,
      _reason: opts.reason,
      _estimated_minutes: opts.estimated,
    });
    if (error) { toast.error(error.message || 'Erro ao atualizar pedido'); return; }
    toast.success('Pedido atualizado');
    qc.invalidateQueries({ queryKey: ['delivery-orders', companyId] });
    if (selected?.id === order.id) setSelected({ ...order, status: next });
    if (autoWa) notify(order, next, opts);
  }

  async function assignDriver(order: OrderRow, driverId: string | null) {
    const { error } = await supabase.rpc('admin_assign_delivery_driver', {
      _order_id: order.id,
      _driver_id: driverId as any,
    });
    if (error) { toast.error(error.message || 'Erro ao atribuir entregador'); return; }
    toast.success(driverId ? 'Entregador atribuído' : 'Entregador removido');
    qc.invalidateQueries({ queryKey: ['delivery-orders', companyId] });
    if (selected?.id === order.id) setSelected({ ...order, driver_id: driverId });
  }

  async function setPaymentStatus(order: OrderRow, status: string) {
    const { error } = await supabase.rpc('admin_set_delivery_payment_status', {
      _order_id: order.id,
      _payment_status: status,
    });
    if (error) { toast.error(error.message || 'Erro ao atualizar pagamento'); return; }
    toast.success('Pagamento atualizado');
    qc.invalidateQueries({ queryKey: ['delivery-orders', companyId] });
    if (selected?.id === order.id) setSelected({ ...order, payment_status: status });
  }

  const canCancel = (s: string) => ['aguardando_aceite', 'em_preparo', 'pronto', 'em_entrega'].includes(s);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pedidos Delivery</h1>
          <p className="text-sm text-muted-foreground">Fluxo de pedidos vindos do cardápio digital.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-sm">{pending} novos</Badge>
          <Button variant={autoWa ? 'default' : 'outline'} size="sm" onClick={() => setAutoWa((v) => !v)}>
            <MessageCircle className="h-4 w-4 mr-1" />
            {autoWa ? 'Avisar no WhatsApp: on' : 'Avisar no WhatsApp: off'}
          </Button>
          <Button variant={soundOn ? 'default' : 'outline'} size="sm" onClick={() => setSoundOn((v) => !v)}>
            {soundOn ? <Volume2 className="h-4 w-4 mr-1" /> : <VolumeX className="h-4 w-4 mr-1" />}
            {soundOn ? 'Som ligado' : 'Som desligado'}
          </Button>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="ativos">Ativos</TabsTrigger>
          <TabsTrigger value="aguardando_aceite">Novos ({pending})</TabsTrigger>
          <TabsTrigger value="em_preparo">Em preparo</TabsTrigger>
          <TabsTrigger value="pronto">Prontos</TabsTrigger>
          <TabsTrigger value="em_entrega">Em entrega</TabsTrigger>
          <TabsTrigger value="finalizados">Finalizados</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          {isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Nenhum pedido nesta categoria.</div>
          )}
          {!isLoading && filtered.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  driverName={driverName(o.driver_id)}
                  onOpen={() => setSelected(o)}
                  onAccept={() => updateStatus(o, 'em_preparo', { estimated: Number(estimate) || undefined })}
                  onReject={() => { setReason(''); setReasonDialog({ order: o, next: 'recusado' }); }}
                  onCancel={canCancel(o.status) && o.status !== 'aguardando_aceite' ? () => { setReason(''); setReasonDialog({ order: o, next: 'cancelado' }); } : undefined}
                  onAdvance={(next) => updateStatus(o, next)}
                  onNotify={() => notify(o, o.status)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <OrderDetailsDialog
        order={selected}
        drivers={drivers}
        onClose={() => setSelected(null)}
        onUpdate={(next, opts) => selected && updateStatus(selected, next, opts)}
        onAssignDriver={(id) => selected && assignDriver(selected, id)}
        onPaymentStatus={(s) => selected && setPaymentStatus(selected, s)}
        onNotify={() => selected && notify(selected, selected.status)}
        onCancel={() => selected && (setReason(''), setReasonDialog({ order: selected, next: 'cancelado' }))}
        estimateDefault={estimate}
        onEstimateChange={setEstimate}
      />

      <Dialog open={!!reasonDialog} onOpenChange={(o) => !o && setReasonDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reasonDialog?.next === 'recusado' ? 'Recusar pedido' : 'Cancelar pedido'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo (obrigatório, informado ao cliente)</Label>
            <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: Item esgotado, fora da área de entrega…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonDialog(null)}>Voltar</Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 3}
              onClick={async () => {
                if (!reasonDialog) return;
                await updateStatus(reasonDialog.order, reasonDialog.next, { reason: reason.trim() });
                setReasonDialog(null); setReason(''); setSelected(null);
              }}
            >
              {reasonDialog?.next === 'recusado' ? 'Recusar pedido' : 'Cancelar pedido'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrderCard({ order, driverName, onOpen, onAccept, onReject, onCancel, onAdvance, onNotify }: Readonly<{
  order: OrderRow;
  driverName: string | null;
  onOpen: () => void;
  onAccept: () => void;
  onReject: () => void;
  onCancel?: () => void;
  onAdvance: (next: string) => void;
  onNotify: () => void;
}>) {
  const meta = STATUS_META[order.status] ?? { label: order.status, tone: 'bg-neutral-100 text-neutral-800' };
  const pay = PAYMENT_STATUS_META[order.payment_status ?? 'pendente'] ?? PAYMENT_STATUS_META.pendente;
  const minutesOpen = Math.floor((Date.now() - new Date(order.opened_at).getTime()) / 60000);
  const eta = ACTIVE_STATUSES.has(order.status) ? etaLabel(order) : null;
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">#{order.order_number} · {fmtDateTime(order.opened_at)}</div>
          <div className="font-semibold break-words">{order.customer_name || 'Cliente'}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            {order.service_mode === 'delivery' ? <Bike className="h-3 w-3" /> : <PackageCheck className="h-3 w-3" />}
            {order.service_mode === 'delivery' ? 'Entrega' : 'Retirada'} · há {minutesOpen}min
          </div>
          {eta && <div className="text-xs text-muted-foreground">Previsão: {eta}</div>}
          {driverName && <div className="text-xs text-muted-foreground">Entregador: {driverName}</div>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`px-2 py-1 rounded-full text-[11px] font-medium ${meta.tone}`}>{meta.label}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${pay.tone}`}>{pay.label}</span>
        </div>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Total</span>
        <span className="font-semibold tabular-nums">{fmtBRL(order.total)}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onOpen}>Detalhes</Button>
        {order.status === 'aguardando_aceite' && (
          <>
            <Button size="sm" onClick={onAccept}><CheckCircle2 className="h-4 w-4 mr-1" />Aceitar</Button>
            <Button size="sm" variant="destructive" onClick={onReject}><XCircle className="h-4 w-4 mr-1" />Recusar</Button>
          </>
        )}
        {order.status === 'em_preparo' && (
          <Button size="sm" onClick={() => onAdvance('pronto')}><ChefHat className="h-4 w-4 mr-1" />Marcar pronto</Button>
        )}
        {order.status === 'pronto' && order.service_mode === 'delivery' && (
          <Button size="sm" onClick={() => onAdvance('em_entrega')}><Truck className="h-4 w-4 mr-1" />Saiu p/ entrega</Button>
        )}
        {order.status === 'pronto' && order.service_mode === 'pickup' && (
          <Button size="sm" onClick={() => onAdvance('entregue')}><PackageCheck className="h-4 w-4 mr-1" />Entregue</Button>
        )}
        {order.status === 'em_entrega' && (
          <Button size="sm" onClick={() => onAdvance('entregue')}><PackageCheck className="h-4 w-4 mr-1" />Confirmar entrega</Button>
        )}
        {NOTIFIABLE.has(order.status) && (
          <Button size="sm" variant="outline" onClick={onNotify}><MessageCircle className="h-4 w-4 mr-1" />Avisar</Button>
        )}
        {onCancel && (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onCancel}><Ban className="h-4 w-4 mr-1" />Cancelar</Button>
        )}
      </div>
    </div>
  );
}

function OrderDetailsDialog({ order, drivers, onClose, onUpdate, onAssignDriver, onPaymentStatus, onNotify, onCancel, estimateDefault, onEstimateChange }: Readonly<{
  order: OrderRow | null;
  drivers: Driver[];
  onClose: () => void;
  onUpdate: (next: string, opts?: { reason?: string; estimated?: number }) => void;
  onAssignDriver: (driverId: string | null) => void;
  onPaymentStatus: (status: string) => void;
  onNotify: () => void;
  onCancel: () => void;
  estimateDefault: string;
  onEstimateChange: (v: string) => void;
}>) {
  const { data: items = [] } = useQuery({
    queryKey: ['order-items', order?.id],
    queryFn: () => fetchOrderItems(order!.id),
    enabled: !!order?.id,
  });
  if (!order) return null;
  const addr = order.delivery_address as any;
  const activeDrivers = drivers.filter((d) => d.active || d.id === order.driver_id);
  const canCancel = ['em_preparo', 'pronto', 'em_entrega'].includes(order.status);
  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Pedido #{order.order_number}</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            <Info label="Cliente" value={order.customer_name || '—'} />
            <Info label="Telefone" value={order.customer_phone ? <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`tel:${order.customer_phone}`}><Phone className="h-3 w-3"/>{order.customer_phone}</a> : '—'} />
            <Info label="Modo" value={order.service_mode === 'delivery' ? 'Entrega' : 'Retirada'} />
            <Info label="Pagamento" value={PAYMENT_LABELS[order.payment_method as PaymentMethod] ?? '—'} />
            {order.change_for ? <Info label="Troco para" value={fmtBRL(order.change_for)} /> : null}
            <Info label="Aberto em" value={fmtDateTime(order.opened_at)} />
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Situação do pagamento</div>
            <Select value={order.payment_status ?? 'pendente'} onValueChange={onPaymentStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="estornado">Estornado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {order.service_mode === 'delivery' && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Entregador</div>
              <Select
                value={order.driver_id ?? 'none'}
                onValueChange={(v) => onAssignDriver(v === 'none' ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Selecionar entregador" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem entregador</SelectItem>
                  {activeDrivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {activeDrivers.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Cadastre entregadores em Cardápio Digital → Entregadores.</p>
              )}
            </div>
          )}

          {order.service_mode === 'delivery' && addr && (
            <div className="rounded-lg border p-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Endereço</div>
              <div>{addr.street}, {addr.number}{addr.complement ? ` — ${addr.complement}` : ''}</div>
              <div>{addr.neighborhood}{addr.city ? ` · ${addr.city}` : ''}</div>
              {addr.reference && <div className="text-xs text-muted-foreground">Ref: {addr.reference}</div>}
            </div>
          )}

          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Itens</div>
            <ul className="divide-y rounded-lg border">
              {groupItems(items as any).map((row) => (
                <li key={row.key} className="p-2 flex justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium break-words">{row.quantity}× {row.first.product_name}</div>
                    {row.first.notes && <div className="text-xs text-muted-foreground">{row.first.notes}</div>}
                  </div>
                  <div className="text-right tabular-nums">{fmtBRL(Number(row.total_price))}</div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border p-3 space-y-1">
            <Row label="Subtotal" value={fmtBRL(order.subtotal)} />
            {order.delivery_fee > 0 && <Row label="Taxa de entrega" value={fmtBRL(order.delivery_fee)} />}
            <Row label="Total" value={fmtBRL(order.total)} bold />
          </div>

          {order.customer_notes && (
            <div className="rounded-lg border p-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Observações</div>
              <div className="whitespace-pre-wrap">{order.customer_notes}</div>
            </div>
          )}

          {(order.rejection_reason || order.cancellation_reason) && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <div className="text-xs font-semibold uppercase text-destructive mb-1">Motivo</div>
              <div>{order.rejection_reason || order.cancellation_reason}</div>
            </div>
          )}

          {order.status === 'aguardando_aceite' && (
            <div className="rounded-lg border p-3 space-y-2">
              <Label className="text-xs">Tempo estimado (min)</Label>
              <Input type="number" min={5} step={5} value={estimateDefault} onChange={(e) => onEstimateChange(e.target.value)} />
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => onUpdate('em_preparo', { estimated: Number(estimateDefault) || undefined })}>
                  <CheckCircle2 className="h-4 w-4 mr-1"/> Aceitar e iniciar preparo
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {NOTIFIABLE.has(order.status) && (
              <Button size="sm" variant="outline" onClick={onNotify}><MessageCircle className="h-4 w-4 mr-1" />Avisar cliente no WhatsApp</Button>
            )}
            {canCancel && (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={onCancel}><Ban className="h-4 w-4 mr-1" />Cancelar pedido</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="break-words">{value}</div>
    </div>
  );
}
function Row({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return <div className={`flex justify-between ${bold ? 'font-semibold pt-1 border-t' : 'text-muted-foreground'}`}><span>{label}</span><span>{value}</span></div>;
}
