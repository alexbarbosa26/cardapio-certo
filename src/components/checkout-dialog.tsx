import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BusyButton } from '@/components/busy-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { fmtBRL, fmtDateTime } from '@/lib/format';
import { printThermal } from '@/lib/print-order';
import { toast } from 'sonner';
import {
  Banknote, CreditCard, QrCode, Printer, Plus, Minus, Trash2, CheckCircle2, BookmarkPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTenantBranding } from '@/hooks/use-tenant-branding';
import { PendurarContaDialog } from '@/components/pendurar-conta-dialog';

type Method = 'dinheiro' | 'pix' | 'debito' | 'credito';

const FEES: Record<Method, number> = { dinheiro: 0, pix: 0, debito: 1.37, credito: 3.17 };

interface Props {
  orderId: string;
  tableId: string;
  tableName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

interface OrderRow {
  id: string; company_id: string; order_number: number;
  subtotal: number; service_fee_percentage: number; service_fee_amount: number;
  discount: number; total: number; paid_amount: number;
}
interface ItemRow {
  id: string; product_name: string; quantity: number;
  unit_price: number; total_price: number;
  paid_quantity: number; payment_status: 'pendente' | 'parcial' | 'pago';
}
interface PaymentRow {
  id: string; method: Method; amount: number; fee_percentage: number;
  fee_amount: number; net_amount: number; received_amount: number;
  change_amount: number; person_label: string | null;
  status: 'ativo' | 'cancelado'; created_at: string;
}

export function CheckoutDialog({ orderId, tableId, tableName, open, onOpenChange }: Props) {
  const { profile } = useAuth();
  const branding = useTenantBranding();
  const isAdmin = profile?.role === 'admin';
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [withFee, setWithFee] = useState(false);
  const [feePct, setFeePct] = useState(10);
  const [discount, setDiscount] = useState(0);
  const [brand, setBrand] = useState<{ name?: string; tradeName?: string; logoUrl?: string }>({});
  const [tab, setTab] = useState<'total' | 'dividir' | 'itens' | 'parcial'>('total');
  const [pendurarOpen, setPendurarOpen] = useState(false);

  const load = async () => {
    const { data: o } = await supabase.from('orders').select('*').eq('id', orderId).single();
    if (!o) return;
    setOrder({
      id: o.id, company_id: o.company_id, order_number: o.order_number,
      subtotal: Number(o.subtotal), service_fee_percentage: Number(o.service_fee_percentage),
      service_fee_amount: Number(o.service_fee_amount), discount: Number(o.discount),
      total: Number(o.total), paid_amount: Number(o.paid_amount ?? 0),
    });
    const { data: its } = await supabase
      .from('order_items')
      .select('id, product_name, quantity, unit_price, total_price, paid_quantity, payment_status')
      .eq('order_id', orderId).order('created_at');
    setItems((its ?? []).map((i: any) => ({
      ...i,
      unit_price: Number(i.unit_price), total_price: Number(i.total_price),
      paid_quantity: Number(i.paid_quantity ?? 0),
    })));
    const { data: pays } = await supabase
      .from('payments').select('*').eq('order_id', orderId).order('created_at');
    setPayments((pays ?? []).map((p: any) => ({
      ...p,
      amount: Number(p.amount), fee_percentage: Number(p.fee_percentage),
      fee_amount: Number(p.fee_amount), net_amount: Number(p.net_amount),
      received_amount: Number(p.received_amount ?? 0),
      change_amount: Number(p.change_amount ?? 0),
    })));
    const { data: st } = await supabase.from('settings')
      .select('service_fee_percentage').eq('company_id', o.company_id).maybeSingle();
    if (st?.service_fee_percentage != null) setFeePct(Number(st.service_fee_percentage));
    setWithFee(Number(o.service_fee_amount) > 0);
    setDiscount(Number(o.discount));
    const { data: comp } = await supabase.from('companies')
      .select('name, trade_name, logo_url').eq('id', o.company_id).maybeSingle();
    setBrand({ name: comp?.name || undefined, tradeName: comp?.trade_name || undefined, logoUrl: comp?.logo_url || undefined });
  };

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, orderId]);

  // Realtime refresh
  useEffect(() => {
    if (!open || !profile) return;
    const ch = supabase.channel(`co:${profile.company_id}:checkout-${orderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `order_id=eq.${orderId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `order_id=eq.${orderId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [open, orderId, profile?.company_id]);

  const itemsSubtotal = useMemo(() => items.reduce((s, i) => s + i.total_price, 0), [items]);
  const fee = withFee ? itemsSubtotal * (feePct / 100) : 0;
  const total = Math.max(0, itemsSubtotal + fee - discount);
  const activePaid = useMemo(
    () => payments.filter(p => p.status === 'ativo').reduce((s, p) => s + p.amount, 0),
    [payments],
  );
  const pending = Math.max(0, total - activePaid);
  const quitada = pending <= 0.005 && total > 0;

  // Persist totals (fee/discount) on order whenever they change
  useEffect(() => {
    if (!order) return;
    supabase.from('orders').update({
      subtotal: itemsSubtotal,
      service_fee_amount: fee,
      service_fee_percentage: withFee ? feePct : 0,
      discount,
      total,
    }).eq('id', order.id).then(() => {});
    // eslint-disable-next-line
  }, [withFee, feePct, discount, itemsSubtotal]);

  if (!order) return null;

  const finalize = async () => {
    if (!quitada) { toast.error('Ainda há valor pendente.'); return; }
    await supabase.from('orders').update({
      status: 'fechado', closed_at: new Date().toISOString(),
    }).eq('id', orderId);
    await supabase.from('tables').update({ status: 'livre' }).eq('id', tableId);
    toast.success(`Conta da ${tableName} finalizada.`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-baseline gap-2">
            <span className="font-display text-2xl">{tableName}</span>
            <span className="text-xs uppercase text-muted-foreground">Pedido #{order.order_number}</span>
            {quitada && <Badge className="bg-success text-success-foreground ml-auto">Conta quitada</Badge>}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-4">

        <Totals total={total} paid={activePaid} pending={pending} />

        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-2.5">
          <div className="text-xs">
            <div className="font-medium">Taxa serviço ({feePct}%)</div>
            <div className="text-muted-foreground">{fmtBRL(fee)}</div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Desconto</Label>
            <Input type="number" min={0} step="0.01" value={discount}
              onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              className="h-8 w-24" />
            <Switch checked={withFee} onCheckedChange={setWithFee} />
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="total">Total</TabsTrigger>
            <TabsTrigger value="dividir">Dividir</TabsTrigger>
            <TabsTrigger value="itens">Por itens</TabsTrigger>
            <TabsTrigger value="parcial">Parcial</TabsTrigger>
          </TabsList>

          <div className="mt-3">
            <TabsContent value="total" className="m-0">
              <PayTotalTab pending={pending} orderId={orderId} companyId={order.company_id} onPaid={load} />
            </TabsContent>
            <TabsContent value="dividir" className="m-0">
              <PaySplitTab total={total} pending={pending} orderId={orderId} companyId={order.company_id} onPaid={load} />
            </TabsContent>
            <TabsContent value="itens" className="m-0">
              <PayItemsTab items={items} orderId={orderId} companyId={order.company_id} onPaid={load} />
            </TabsContent>
            <TabsContent value="parcial" className="m-0">
              <PayPartialTab pending={pending} orderId={orderId} companyId={order.company_id} onPaid={load} />
            </TabsContent>
          </div>
        </Tabs>

        <PaymentsHistory
          payments={payments} isAdmin={isAdmin}
          onRefund={async (id) => {
            if (!confirm('Estornar este pagamento?')) return;
            const { error } = await supabase.from('payments').update({
              status: 'cancelado', canceled_at: new Date().toISOString(), canceled_by: profile?.id,
            }).eq('id', id);
            if (error) toast.error(error.message); else { toast.success('Pagamento estornado.'); load(); }
          }}
        />
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={() => printThermal({
            title: tableName,
            subtitle: `Conta · Pedido #${order.order_number}`,
            brand, showPrices: true, showUnitPrice: true,
            items: items.map((i) => ({
              quantity: i.quantity, product_name: i.product_name,
              unit_price: i.unit_price, total_price: i.total_price,
            })),
            totals: [
              { label: 'Subtotal', value: fmtBRL(itemsSubtotal) },
              ...(withFee ? [{ label: `Taxa serviço (${feePct}%)`, value: fmtBRL(fee) }] : []),
              ...(discount > 0 ? [{ label: 'Desconto', value: `- ${fmtBRL(discount)}` }] : []),
              { label: 'Total', value: fmtBRL(total), bold: true },
              ...(activePaid > 0 ? [{ label: 'Pago', value: fmtBRL(activePaid) }] : []),
              ...(pending > 0 ? [{ label: 'Pendente', value: fmtBRL(pending), bold: true }] : []),
            ],
            footer: quitada ? 'Conta quitada · Obrigado!' : 'Obrigado pela preferência!',
          })}><Printer className="h-4 w-4 mr-1" /> Imprimir</Button>
          {branding.enableCreditAccounts && pending > 0 && !quitada && (
            <Button variant="outline" onClick={() => setPendurarOpen(true)}>
              <BookmarkPlus className="h-4 w-4 mr-1" />Pendurar
            </Button>
          )}
          <Button onClick={finalize} disabled={!quitada} className="bg-primary">
            <CheckCircle2 className="h-4 w-4 mr-1" />Finalizar mesa
          </Button>
        </DialogFooter>
      </DialogContent>
      <PendurarContaDialog
        open={pendurarOpen}
        onOpenChange={setPendurarOpen}
        source={{ kind: 'order', orderId: order.id, tableId }}
        amount={pending}
        onSuccess={() => onOpenChange(false)}
      />
    </Dialog>
  );
}

/* -------- Totals header -------- */
function Totals({ total, paid, pending }: { total: number; paid: number; pending: number }) {
  return (
    <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-secondary/40 p-3">
      <Box label="Total" value={fmtBRL(total)} />
      <Box label="Pago" value={fmtBRL(paid)} tone="success" />
      <Box label="Falta pagar" value={fmtBRL(pending)} tone={pending > 0 ? 'warning' : 'success'} />
    </div>
  );
}
function Box({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warning' }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn(
        'font-display text-xl tabular-nums',
        tone === 'success' && 'text-success',
        tone === 'warning' && 'text-warning',
      )}>{value}</div>
    </div>
  );
}

/* -------- Method selector -------- */
function MethodPicker({ method, onChange }: { method: Method; onChange: (m: Method) => void }) {
  const opts = [
    { id: 'dinheiro', label: 'Dinheiro', icon: Banknote },
    { id: 'pix', label: 'Pix', icon: QrCode },
    { id: 'debito', label: 'Débito', icon: CreditCard },
    { id: 'credito', label: 'Crédito', icon: CreditCard },
  ] as { id: Method; label: string; icon: any }[];
  return (
    <div className="grid grid-cols-4 gap-2">
      {opts.map((m) => {
        const Icon = m.icon;
        const active = method === m.id;
        return (
          <button key={m.id} type="button" onClick={() => onChange(m.id)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition',
              active ? 'border-accent bg-accent/10 text-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}>
            <Icon className="h-4 w-4" />{m.label}
          </button>
        );
      })}
    </div>
  );
}

async function registerPayment(opts: {
  orderId: string; companyId: string;
  method: Method; amount: number;
  received?: number; personLabel?: string;
  allocations?: { order_item_id: string; quantity_paid: number; amount_allocated: number; company_id: string; order_id: string }[];
}) {
  if (opts.amount <= 0) { toast.error('Valor inválido.'); return false; }
  const fee_percentage = FEES[opts.method];
  const fee_amount = opts.amount * (fee_percentage / 100);
  const net_amount = opts.amount - fee_amount;
  const received = opts.method === 'dinheiro' ? (opts.received ?? opts.amount) : 0;
  const change = opts.method === 'dinheiro' ? Math.max(0, received - opts.amount) : 0;
  if (opts.method === 'dinheiro' && received < opts.amount) {
    toast.error('Valor recebido insuficiente.'); return false;
  }
  const { data: reg } = await supabase.from('cash_registers').select('id')
    .eq('company_id', opts.companyId).eq('status', 'aberto')
    .order('opened_at', { ascending: false }).limit(1).maybeSingle();

  const { data: pay, error } = await supabase.from('payments').insert({
    company_id: opts.companyId, order_id: opts.orderId, register_id: reg?.id ?? null,
    method: opts.method, amount: opts.amount,
    fee_percentage, fee_amount, net_amount,
    received_amount: received, change_amount: change,
    person_label: opts.personLabel ?? null,
  }).select('id').single();
  if (error || !pay) { toast.error(error?.message ?? 'Erro ao registrar.'); return false; }

  if (opts.allocations?.length) {
    const rows = opts.allocations.map(a => ({ ...a, payment_id: pay.id }));
    const { error: aerr } = await supabase.from('order_payment_allocations').insert(rows);
    if (aerr) { toast.error(aerr.message); return false; }
  }
  if (!reg) toast.warning('Pagamento registrado · nenhum caixa aberto.');
  else toast.success('Pagamento registrado.');
  return true;
}

/* -------- Tab: total -------- */
function PayTotalTab({ pending, orderId, companyId, onPaid }: { pending: number; orderId: string; companyId: string; onPaid: () => void }) {
  const [method, setMethod] = useState<Method>('dinheiro');
  const [received, setReceived] = useState('');
  const rec = Number(received.replace(',', '.')) || 0;
  const change = method === 'dinheiro' ? Math.max(0, rec - pending) : 0;
  const fee = pending * (FEES[method] / 100);
  return (
    <div className="space-y-3">
      <MethodPicker method={method} onChange={setMethod} />
      {method === 'dinheiro' && (
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Valor recebido</Label>
            <Input value={received} onChange={(e) => setReceived(e.target.value)} placeholder={pending.toFixed(2)} />
          </div>
          <div><div className="text-[10px] uppercase text-muted-foreground">Troco</div>
            <div className="text-xl font-semibold">{fmtBRL(change)}</div></div>
        </div>
      )}
      {(method === 'debito' || method === 'credito') && (
        <div className="text-xs text-muted-foreground">
          Taxa {FEES[method]}% = {fmtBRL(fee)} · líquido {fmtBRL(pending - fee)}
        </div>
      )}
      <Button className="w-full" disabled={pending <= 0}
        onClick={async () => {
          const ok = await registerPayment({
            orderId, companyId, method, amount: pending,
            received: method === 'dinheiro' ? rec || pending : undefined,
          });
          if (ok) { setReceived(''); onPaid(); }
        }}>
        Pagar {fmtBRL(pending)}
      </Button>
    </div>
  );
}

/* -------- Tab: dividir -------- */
function PaySplitTab({ pending, orderId, companyId, onPaid }: { total: number; pending: number; orderId: string; companyId: string; onPaid: () => void }) {
  const [people, setPeople] = useState(2);
  const [paidIdx, setPaidIdx] = useState<Set<number>>(new Set());
  const [methods, setMethods] = useState<Method[]>([]);
  useEffect(() => {
    setMethods((prev) => Array.from({ length: people }, (_, i) => prev[i] ?? 'dinheiro'));
    setPaidIdx(new Set());
  }, [people]);
  const shares = useMemo(() => {
    const cents = Math.round(pending * 100);
    const base = Math.floor(cents / people);
    const arr = Array(people).fill(base / 100);
    const rest = (cents - base * people) / 100;
    arr[people - 1] = +(arr[people - 1] + rest).toFixed(2);
    return arr;
  }, [pending, people]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label>Pessoas</Label>
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setPeople(Math.max(2, people - 1))}><Minus className="h-3 w-3" /></Button>
        <span className="font-semibold w-8 text-center">{people}</span>
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setPeople(Math.min(20, people + 1))}><Plus className="h-3 w-3" /></Button>
        <span className="ml-auto text-xs text-muted-foreground">Pendente {fmtBRL(pending)}</span>
      </div>
      <div className="space-y-2">
        {shares.map((amt, i) => {
          const done = paidIdx.has(i);
          return (
            <div key={i} className={cn('rounded-lg border p-2.5 space-y-2', done ? 'border-success/40 bg-success/5' : 'border-border bg-card')}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Pessoa {i + 1}</div>
                <div className="font-semibold tabular-nums">{fmtBRL(amt)}</div>
              </div>
              {!done && (
                <>
                  <MethodPicker method={methods[i] ?? 'dinheiro'} onChange={(m) => {
                    const next = [...methods]; next[i] = m; setMethods(next);
                  }} />
                  <Button size="sm" className="w-full"
                    onClick={async () => {
                      const ok = await registerPayment({
                        orderId, companyId, method: methods[i] ?? 'dinheiro',
                        amount: amt, personLabel: `Pessoa ${i + 1}`,
                      });
                      if (ok) { setPaidIdx(new Set([...paidIdx, i])); onPaid(); }
                    }}>Registrar</Button>
                </>
              )}
              {done && <Badge className="bg-success text-success-foreground">Pago</Badge>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------- Tab: por itens -------- */
function PayItemsTab({ items, orderId, companyId, onPaid }: { items: ItemRow[]; orderId: string; companyId: string; onPaid: () => void }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<Method>('dinheiro');
  const [received, setReceived] = useState('');

  const remaining = (it: ItemRow) => Math.max(0, it.quantity - it.paid_quantity);

  const selectedTotal = useMemo(() =>
    items.reduce((s, it) => s + (qty[it.id] ?? 0) * it.unit_price, 0),
  [qty, items]);

  const rec = Number(received.replace(',', '.')) || 0;
  const change = method === 'dinheiro' ? Math.max(0, rec - selectedTotal) : 0;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card divide-y">
        {items.map((it) => {
          const rem = remaining(it);
          const cur = qty[it.id] ?? 0;
          return (
            <div key={it.id} className="flex items-center gap-2 p-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{it.product_name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {fmtBRL(it.unit_price)} · {it.paid_quantity}/{it.quantity} pago
                  {it.payment_status !== 'pendente' && <Badge variant="outline" className="ml-1 h-4 px-1 text-[9px]">{it.payment_status}</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="h-7 w-7"
                  disabled={cur <= 0}
                  onClick={() => setQty({ ...qty, [it.id]: Math.max(0, cur - 1) })}>
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-6 text-center text-sm tabular-nums">{cur}</span>
                <Button size="icon" variant="outline" className="h-7 w-7"
                  disabled={cur >= rem}
                  onClick={() => setQty({ ...qty, [it.id]: Math.min(rem, cur + 1) })}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Selecionado</span>
        <span className="font-display text-lg">{fmtBRL(selectedTotal)}</span>
      </div>
      <MethodPicker method={method} onChange={setMethod} />
      {method === 'dinheiro' && (
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Recebido</Label>
            <Input value={received} onChange={(e) => setReceived(e.target.value)} placeholder={selectedTotal.toFixed(2)} /></div>
          <div><div className="text-[10px] uppercase text-muted-foreground">Troco</div>
            <div className="text-xl font-semibold">{fmtBRL(change)}</div></div>
        </div>
      )}
      <Button className="w-full" disabled={selectedTotal <= 0}
        onClick={async () => {
          const allocs = items
            .filter(it => (qty[it.id] ?? 0) > 0)
            .map(it => ({
              company_id: companyId, order_id: orderId,
              order_item_id: it.id, quantity_paid: qty[it.id],
              amount_allocated: +(qty[it.id] * it.unit_price).toFixed(2),
            }));
          const ok = await registerPayment({
            orderId, companyId, method, amount: selectedTotal,
            received: method === 'dinheiro' ? rec || selectedTotal : undefined,
            allocations: allocs,
          });
          if (ok) { setQty({}); setReceived(''); onPaid(); }
        }}>
        Pagar itens · {fmtBRL(selectedTotal)}
      </Button>
    </div>
  );
}

/* -------- Tab: parcial -------- */
function PayPartialTab({ pending, orderId, companyId, onPaid }: { pending: number; orderId: string; companyId: string; onPaid: () => void }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Method>('dinheiro');
  const [received, setReceived] = useState('');
  const amt = Number(amount.replace(',', '.')) || 0;
  const rec = Number(received.replace(',', '.')) || 0;
  const change = method === 'dinheiro' ? Math.max(0, rec - amt) : 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Valor</Label>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={pending.toFixed(2)} /></div>
        <div className="flex items-end"><span className="text-xs text-muted-foreground">Pendente: {fmtBRL(pending)}</span></div>
      </div>
      <MethodPicker method={method} onChange={setMethod} />
      {method === 'dinheiro' && (
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Recebido</Label>
            <Input value={received} onChange={(e) => setReceived(e.target.value)} placeholder={amt.toFixed(2)} /></div>
          <div><div className="text-[10px] uppercase text-muted-foreground">Troco</div>
            <div className="text-xl font-semibold">{fmtBRL(change)}</div></div>
        </div>
      )}
      <Button className="w-full" disabled={amt <= 0 || amt > pending + 0.005}
        onClick={async () => {
          const ok = await registerPayment({
            orderId, companyId, method, amount: amt,
            received: method === 'dinheiro' ? rec || amt : undefined,
          });
          if (ok) { setAmount(''); setReceived(''); onPaid(); }
        }}>
        Registrar {fmtBRL(amt)}
      </Button>
    </div>
  );
}

/* -------- Histórico -------- */
function PaymentsHistory({ payments, isAdmin, onRefund }: { payments: PaymentRow[]; isAdmin: boolean; onRefund: (id: string) => void }) {
  if (!payments.length) return null;
  const labels: Record<Method, string> = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Débito', credito: 'Crédito' };
  return (
    <div className="rounded-lg border border-border bg-card max-h-40 overflow-y-auto">
      <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b">Histórico de pagamentos</div>
      <div className="divide-y">
        {payments.map((p) => (
          <div key={p.id} className={cn('flex items-center gap-2 px-3 py-2 text-xs', p.status === 'cancelado' && 'opacity-50 line-through')}>
            <div className="flex-1 min-w-0">
              <div className="font-medium">{labels[p.method]} · {fmtBRL(p.amount)}{p.person_label ? ` · ${p.person_label}` : ''}</div>
              <div className="text-[10px] text-muted-foreground">
                {fmtDateTime(p.created_at)}
                {p.fee_amount > 0 && ` · taxa ${fmtBRL(p.fee_amount)}`}
                {p.change_amount > 0 && ` · troco ${fmtBRL(p.change_amount)}`}
              </div>
            </div>
            {p.status === 'ativo' && isAdmin && (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onRefund(p.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
            {p.status === 'cancelado' && <Badge variant="outline" className="text-[9px]">Estornado</Badge>}
          </div>
        ))}
      </div>
    </div>
  );
}
