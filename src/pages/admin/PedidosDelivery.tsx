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
import { toast } from 'sonner';
import { fmtBRL, fmtDateTime } from '@/lib/format';
import { PAYMENT_LABELS, type PaymentMethod } from '@/lib/digital-menu-cart';
import { Bike, ChefHat, CheckCircle2, Clock, PackageCheck, Phone, Truck, XCircle, Volume2, VolumeX } from 'lucide-react';

type OrderRow = {
  id: string;
  order_number: number;
  status: string;
  service_mode: string;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: any;
  payment_method: string | null;
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

const ACTIVE_STATUSES = ['aguardando_aceite', 'em_preparo', 'pronto', 'em_entrega'];

async function fetchDeliveryOrders(companyId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, status, service_mode, customer_name, customer_phone, delivery_address, payment_method, change_for, customer_notes, subtotal, delivery_fee, total, opened_at, accepted_at, ready_at, dispatched_at, delivered_at, estimated_minutes, rejection_reason')
    .eq('company_id', companyId)
    .eq('origin', 'digital_menu')
    .order('opened_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as OrderRow[];
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
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
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
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [estimate, setEstimate] = useState<string>('30');
  const [soundOn, setSoundOn] = useState<boolean>(() => localStorage.getItem('mc:delivery:sound') !== '0');
  const lastPendingCount = useRef<number | null>(null);

  useEffect(() => { document.title = 'Pedidos Delivery'; }, []);
  useEffect(() => { localStorage.setItem('mc:delivery:sound', soundOn ? '1' : '0'); }, [soundOn]);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['delivery-orders', companyId],
    queryFn: () => fetchDeliveryOrders(companyId!),
    enabled: !!companyId,
    refetchInterval: 20_000,
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
    if (tab === 'ativos') return orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
    if (tab === 'finalizados') return orders.filter((o) => ['entregue', 'recusado', 'cancelado', 'fechado'].includes(o.status));
    return orders.filter((o) => o.status === tab);
  }, [orders, tab]);

  async function updateStatus(order: OrderRow, next: string, opts: { reason?: string; estimated?: number } = {}) {
    const { error } = await supabase.rpc('admin_update_delivery_order_status', {
      _order_id: order.id,
      _new_status: next,
      _reason: opts.reason ?? null,
      _estimated_minutes: opts.estimated ?? null,
    });
    if (error) { toast.error(error.message || 'Erro ao atualizar pedido'); return; }
    toast.success('Pedido atualizado');
    qc.invalidateQueries({ queryKey: ['delivery-orders', companyId] });
    if (selected?.id === order.id) setSelected({ ...order, status: next });
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pedidos Delivery</h1>
          <p className="text-sm text-muted-foreground">Fluxo de pedidos vindos do cardápio digital.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-sm">{pending} novos</Badge>
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
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando…</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Nenhum pedido nesta categoria.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  onOpen={() => setSelected(o)}
                  onAccept={() => updateStatus(o, 'em_preparo', { estimated: Number(estimate) || undefined })}
                  onReject={() => { setSelected(o); setRejectOpen(true); }}
                  onAdvance={(next) => updateStatus(o, next)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <OrderDetailsDialog
        order={selected}
        onClose={() => setSelected(null)}
        onUpdate={(next, opts) => selected && updateStatus(selected, next, opts)}
        estimateDefault={estimate}
        onEstimateChange={setEstimate}
      />

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Recusar pedido</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Motivo (informado ao cliente)</Label>
            <Textarea rows={4} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Ex.: Item esgotado, fora da área de entrega…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!selected) return;
                await updateStatus(selected, 'recusado', { reason: rejectReason.trim() || 'Não especificado' });
                setRejectOpen(false); setRejectReason(''); setSelected(null);
              }}
            >Recusar pedido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrderCard({ order, onOpen, onAccept, onReject, onAdvance }: {
  order: OrderRow;
  onOpen: () => void;
  onAccept: () => void;
  onReject: () => void;
  onAdvance: (next: string) => void;
}) {
  const meta = STATUS_META[order.status] ?? { label: order.status, tone: 'bg-neutral-100 text-neutral-800' };
  const minutesOpen = Math.floor((Date.now() - new Date(order.opened_at).getTime()) / 60000);
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">#{order.order_number} · {fmtDateTime(order.opened_at)}</div>
          <div className="font-semibold truncate">{order.customer_name || 'Cliente'}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            {order.service_mode === 'delivery' ? <Bike className="h-3 w-3" /> : <PackageCheck className="h-3 w-3" />}
            {order.service_mode === 'delivery' ? 'Entrega' : 'Retirada'} · há {minutesOpen}min
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-[11px] font-medium ${meta.tone}`}>{meta.label}</span>
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
      </div>
    </div>
  );
}

function OrderDetailsDialog({ order, onClose, onUpdate, estimateDefault, onEstimateChange }: {
  order: OrderRow | null;
  onClose: () => void;
  onUpdate: (next: string, opts?: { reason?: string; estimated?: number }) => void;
  estimateDefault: string;
  onEstimateChange: (v: string) => void;
}) {
  const { data: items = [] } = useQuery({
    queryKey: ['order-items', order?.id],
    queryFn: () => fetchOrderItems(order!.id),
    enabled: !!order?.id,
  });
  if (!order) return null;
  const addr = order.delivery_address as any;
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
              {items.map((it: any) => (
                <li key={it.id} className="p-2 flex justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{it.quantity}× {it.product_name}</div>
                    {it.notes && <div className="text-xs text-muted-foreground">{it.notes}</div>}
                  </div>
                  <div className="text-right tabular-nums">{fmtBRL(Number(it.total_price))}</div>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}
function Row({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return <div className={`flex justify-between ${bold ? 'font-semibold pt-1 border-t' : 'text-muted-foreground'}`}><span>{label}</span><span>{value}</span></div>;
}
