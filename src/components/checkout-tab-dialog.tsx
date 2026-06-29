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
import { Banknote, CreditCard, QrCode, Printer, Plus, Minus, Trash2, CheckCircle2, BookmarkPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTenantBranding } from '@/hooks/use-tenant-branding';
import { PendurarContaDialog } from '@/components/pendurar-conta-dialog';

type Method = 'dinheiro' | 'pix' | 'debito' | 'credito';
const FEES: Record<Method, number> = { dinheiro: 0, pix: 0, debito: 1.37, credito: 3.17 };

interface Props {
  tabId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onFinalized?: () => void;
}

interface TabRow {
  id: string; company_id: string; tab_number: number; customer_name: string | null;
  subtotal: number; service_fee_percentage: number; service_fee_amount: number;
  discount: number; total: number; paid_amount: number; status: string;
}
interface ItemRow {
  id: string; product_name: string; quantity: number; unit_price: number; total_price: number;
  item_type: 'fixo' | 'peso' | 'manual'; weight_grams: number | null;
}
interface PaymentRow {
  id: string; method: Method; amount: number; fee_amount: number;
  received_amount: number; change_amount: number; person_label: string | null;
  status: 'ativo' | 'cancelado'; created_at: string;
}

export function CheckoutTabDialog({ tabId, open, onOpenChange, onFinalized }: Props) {
  const { profile } = useAuth();
  const branding = useTenantBranding();
  const isAdmin = profile?.role === 'admin';
  const [tab, setTab] = useState<TabRow | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [feePct, setFeePct] = useState(0);
  const [withFee, setWithFee] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [brand, setBrand] = useState<{ name?: string; tradeName?: string; logoUrl?: string }>({});
  const [tabKey, setTabKey] = useState<'total' | 'dividir' | 'parcial'>('total');
  const [pendurarOpen, setPendurarOpen] = useState(false);

  const load = async () => {
    const { data: t } = await supabase.from('customer_tabs').select('*').eq('id', tabId).single();
    if (!t) return;
    setTab({
      id: t.id, company_id: t.company_id, tab_number: t.tab_number, customer_name: t.customer_name,
      subtotal: Number(t.subtotal), service_fee_percentage: Number(t.service_fee_percentage),
      service_fee_amount: Number(t.service_fee_amount), discount: Number(t.discount),
      total: Number(t.total), paid_amount: Number(t.paid_amount), status: t.status,
    });
    setWithFee(Number(t.service_fee_percentage) > 0);
    setFeePct(Number(t.service_fee_percentage) || 0);
    setDiscount(Number(t.discount));
    const { data: its } = await supabase.from('tab_items')
      .select('id, product_name, quantity, unit_price, total_price, item_type, weight_grams')
      .eq('tab_id', tabId).is('canceled_at', null).order('created_at');
    setItems((its ?? []).map((i: any) => ({
      ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price),
      total_price: Number(i.total_price),
    })));
    const { data: pays } = await supabase.from('tab_payments').select('*').eq('tab_id', tabId).order('created_at');
    setPayments((pays ?? []).map((p: any) => ({
      ...p, amount: Number(p.amount), fee_amount: Number(p.fee_amount),
      received_amount: Number(p.received_amount ?? 0), change_amount: Number(p.change_amount ?? 0),
    })));
    const { data: comp } = await supabase.from('companies')
      .select('name, trade_name, logo_url').eq('id', t.company_id).maybeSingle();
    setBrand({ name: comp?.name || undefined, tradeName: comp?.trade_name || undefined, logoUrl: comp?.logo_url || undefined });
  };

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, tabId]);

  useEffect(() => {
    if (!open || !profile) return;
    const ch = supabase.channel(`co:${profile.company_id}:tab-checkout-${tabId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_payments', filter: `tab_id=eq.${tabId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_items', filter: `tab_id=eq.${tabId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_tabs', filter: `id=eq.${tabId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [open, tabId, profile?.company_id]);

  // persist fee/discount changes
  useEffect(() => {
    if (!tab) return;
    supabase.from('customer_tabs').update({
      service_fee_percentage: withFee ? feePct : 0,
      discount,
    }).eq('id', tab.id).then(() => {});
    // eslint-disable-next-line
  }, [withFee, feePct, discount]);

  if (!tab) return null;
  const total = tab.total;
  const paid = tab.paid_amount;
  const pending = Math.max(0, total - paid);
  const quitada = pending <= 0.005 && total > 0;

  const jaFinalizada = tab.status === 'paga';
  const cancelada = tab.status === 'cancelada';

  const finalize = async () => {
    if (jaFinalizada) { toast.error('Comanda já finalizada.'); return; }
    if (cancelada) { toast.error('Comanda cancelada.'); return; }
    if (!quitada) { toast.error('Ainda há valor pendente.'); return; }
    const { error } = await supabase.from('customer_tabs').update({
      status: 'paga', closed_at: new Date().toISOString(), closed_by: profile?.id,
    }).eq('id', tab.id).neq('status', 'paga');
    if (error) { toast.error(error.message); return; }
    toast.success(`Comanda #${tab.tab_number} finalizada.`);
    onOpenChange(false);
    onFinalized?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-baseline gap-2">
            <span className="font-display text-2xl">Comanda #{tab.tab_number}</span>
            {tab.customer_name && <span className="text-sm text-muted-foreground">· {tab.customer_name}</span>}
            {quitada && <Badge className="bg-success text-success-foreground ml-auto">Quitada</Badge>}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-4">


        <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-secondary/40 p-3">
          <Box label="Total" value={fmtBRL(total)} />
          <Box label="Pago" value={fmtBRL(paid)} tone="success" />
          <Box label="Falta pagar" value={fmtBRL(pending)} tone={pending > 0 ? 'warning' : 'success'} />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-2.5">
          <div className="flex items-center gap-2 text-xs">
            <Label className="text-xs">Taxa serviço (%)</Label>
            <Input type="number" min={0} step="0.5" value={feePct} disabled={!withFee}
              onChange={(e) => setFeePct(Number(e.target.value) || 0)} className="h-8 w-20" />
            <Switch checked={withFee} onCheckedChange={setWithFee} />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Desconto</Label>
            <Input type="number" min={0} step="0.01" value={discount}
              onChange={(e) => setDiscount(Number(e.target.value) || 0)} className="h-8 w-24" />
          </div>
        </div>

        <Tabs value={tabKey} onValueChange={(v) => setTabKey(v as any)}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="total">Total</TabsTrigger>
            <TabsTrigger value="dividir">Dividir</TabsTrigger>
            <TabsTrigger value="parcial">Parcial</TabsTrigger>
          </TabsList>
          <div className="mt-3">
            <TabsContent value="total" className="m-0">
              <PayTotalTab pending={pending} tabId={tabId} companyId={tab.company_id} onPaid={load} />
            </TabsContent>
            <TabsContent value="dividir" className="m-0">
              <PaySplitTab pending={pending} tabId={tabId} companyId={tab.company_id} onPaid={load} />
            </TabsContent>
            <TabsContent value="parcial" className="m-0">
              <PayPartialTab pending={pending} tabId={tabId} companyId={tab.company_id} onPaid={load} />
            </TabsContent>
          </div>
        </Tabs>

        <PaymentsHistory payments={payments} isAdmin={isAdmin}
          onRefund={async (id) => {
            if (!confirm('Estornar este pagamento?')) return;
            const { error } = await supabase.from('tab_payments').update({
              status: 'cancelado', canceled_at: new Date().toISOString(), canceled_by: profile?.id,
            }).eq('id', id);
            if (error) toast.error(error.message); else { toast.success('Pagamento estornado.'); load(); }
          }}
        />
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={() => printThermal({
            title: `Comanda #${tab.tab_number}`,
            subtitle: tab.customer_name || undefined,
            brand, showPrices: true, showUnitPrice: true,
            items: items.map((i) => ({
              quantity: i.quantity,
              product_name: i.item_type === 'peso' && i.weight_grams
                ? `${i.product_name} (${(i.weight_grams/1000).toFixed(3)} kg)`
                : i.product_name,
              unit_price: i.unit_price, total_price: i.total_price,
            })),
            totals: [
              { label: 'Subtotal', value: fmtBRL(tab.subtotal) },
              ...(tab.service_fee_amount > 0 ? [{ label: `Taxa serviço (${feePct}%)`, value: fmtBRL(tab.service_fee_amount) }] : []),
              ...(tab.discount > 0 ? [{ label: 'Desconto', value: `- ${fmtBRL(tab.discount)}` }] : []),
              { label: 'Total', value: fmtBRL(total), bold: true },
              ...(paid > 0 ? [{ label: 'Pago', value: fmtBRL(paid) }] : []),
              ...(pending > 0 ? [{ label: 'Pendente', value: fmtBRL(pending), bold: true }] : []),
            ],
            footer: quitada ? 'Conta quitada · Obrigado!' : 'Obrigado pela preferência!',
          })}><Printer className="h-4 w-4 mr-1" />Imprimir</Button>
          {branding.enableCreditAccounts && !jaFinalizada && !cancelada && pending > 0 && (
            <Button variant="outline" onClick={() => setPendurarOpen(true)}>
              <BookmarkPlus className="h-4 w-4 mr-1" />Pendurar
            </Button>
          )}
          <BusyButton onClick={finalize} disabled={!quitada || jaFinalizada || cancelada} busyText="Finalizando…">
            <CheckCircle2 className="h-4 w-4 mr-1" />
            {jaFinalizada ? 'Já finalizada' : 'Finalizar comanda'}
          </BusyButton>
        </DialogFooter>
      </DialogContent>
      <PendurarContaDialog
        open={pendurarOpen}
        onOpenChange={setPendurarOpen}
        source={{ kind: 'tab', tabId: tab.id }}
        amount={pending}
        onSuccess={() => { onOpenChange(false); onFinalized?.(); }}
      />
    </Dialog>
  );
}

function Box({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warning' }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('font-display text-xl tabular-nums',
        tone === 'success' && 'text-success', tone === 'warning' && 'text-warning')}>{value}</div>
    </div>
  );
}

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
        const Icon = m.icon; const active = method === m.id;
        return (
          <button key={m.id} type="button" onClick={() => onChange(m.id)}
            className={cn('flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition',
              active ? 'border-accent bg-accent/10 text-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>
            <Icon className="h-4 w-4" />{m.label}
          </button>
        );
      })}
    </div>
  );
}

async function registerTabPayment(opts: {
  tabId: string; companyId: string; method: Method; amount: number;
  received?: number; personLabel?: string;
}) {
  if (opts.amount <= 0) { toast.error('Valor inválido.'); return false; }
  const fee_percentage = FEES[opts.method];
  const fee_amount = +(opts.amount * fee_percentage / 100).toFixed(2);
  const net_amount = +(opts.amount - fee_amount).toFixed(2);
  const received = opts.method === 'dinheiro' ? (opts.received ?? opts.amount) : 0;
  const change = opts.method === 'dinheiro' ? Math.max(0, received - opts.amount) : 0;
  if (opts.method === 'dinheiro' && received < opts.amount) {
    toast.error('Valor recebido insuficiente.'); return false;
  }
  const { data: reg } = await supabase.from('cash_registers').select('id')
    .eq('company_id', opts.companyId).eq('status', 'aberto')
    .order('opened_at', { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from('tab_payments').insert({
    company_id: opts.companyId, tab_id: opts.tabId, register_id: reg?.id ?? null,
    method: opts.method, amount: opts.amount,
    fee_percentage, fee_amount, net_amount,
    received_amount: received, change_amount: change,
    person_label: opts.personLabel ?? null,
  });
  if (error) { toast.error(error.message); return false; }
  if (!reg) toast.warning('Pagamento registrado · nenhum caixa aberto.');
  else toast.success('Pagamento registrado.');
  return true;
}

function PayTotalTab({ pending, tabId, companyId, onPaid }: { pending: number; tabId: string; companyId: string; onPaid: () => void }) {
  const [method, setMethod] = useState<Method>('dinheiro');
  const [received, setReceived] = useState('');
  const rec = Number(received.replace(',', '.')) || 0;
  const change = method === 'dinheiro' ? Math.max(0, rec - pending) : 0;
  return (
    <div className="space-y-3">
      <MethodPicker method={method} onChange={setMethod} />
      {method === 'dinheiro' && (
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Valor recebido</Label>
            <Input value={received} onChange={(e) => setReceived(e.target.value)} placeholder={pending.toFixed(2)} /></div>
          <div><div className="text-[10px] uppercase text-muted-foreground">Troco</div>
            <div className="text-xl font-semibold">{fmtBRL(change)}</div></div>
        </div>
      )}
      <BusyButton className="w-full" disabled={pending <= 0} busyText="Registrando…"
        onClick={async () => {
          const ok = await registerTabPayment({
            tabId, companyId, method, amount: pending,
            received: method === 'dinheiro' ? rec || pending : undefined,
          });
          if (ok) { setReceived(''); onPaid(); }
        }}>Pagar {fmtBRL(pending)}</BusyButton>
    </div>
  );
}

function PaySplitTab({ pending, tabId, companyId, onPaid }: { pending: number; tabId: string; companyId: string; onPaid: () => void }) {
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
              {!done && (<>
                <MethodPicker method={methods[i] ?? 'dinheiro'} onChange={(m) => {
                  const next = [...methods]; next[i] = m; setMethods(next);
                }} />
                <Button size="sm" className="w-full" onClick={async () => {
                  const ok = await registerTabPayment({
                    tabId, companyId, method: methods[i] ?? 'dinheiro',
                    amount: amt, personLabel: `Pessoa ${i + 1}`,
                  });
                  if (ok) { setPaidIdx(new Set([...paidIdx, i])); onPaid(); }
                }}>Registrar</Button>
              </>)}
              {done && <Badge className="bg-success text-success-foreground">Pago</Badge>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PayPartialTab({ pending, tabId, companyId, onPaid }: { pending: number; tabId: string; companyId: string; onPaid: () => void }) {
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
          const ok = await registerTabPayment({
            tabId, companyId, method, amount: amt,
            received: method === 'dinheiro' ? rec || amt : undefined,
          });
          if (ok) { setAmount(''); setReceived(''); onPaid(); }
        }}>Registrar {fmtBRL(amt)}</Button>
    </div>
  );
}

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
