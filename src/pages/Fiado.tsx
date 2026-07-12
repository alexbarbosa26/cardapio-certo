import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useTenantBranding } from '@/hooks/use-tenant-branding';
import { Navigate } from 'react-router-dom';
import { fmtBRL, fmtDateTime } from '@/lib/format';
const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('pt-BR');
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Search, ChevronRight, Banknote, QrCode, CreditCard, AlertCircle, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Method = 'dinheiro' | 'pix' | 'debito' | 'credito';

interface CustomerSummary {
  id: string;
  name: string;
  phone: string | null;
  open_count: number;
  total_due: number;
  last_at: string | null;
}

interface Receivable {
  id: string;
  original_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: 'open' | 'partially_paid' | 'paid' | 'cancelled';
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  tab_id: string | null;
  order_id: string | null;
  tab_number: number | null;
  order_number: number | null;
}

function FiadoPage() {
  const { profile } = useAuth();
  const branding = useTenantBranding();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    const { data: recs } = await supabase
      .from('credit_receivables')
      .select('id, customer_id, remaining_amount, status, opened_at, credit_customers!inner(id, name, phone)')
      .eq('company_id', profile.company_id)
      .neq('status', 'cancelled');

    const map = new Map<string, CustomerSummary>();
    (recs ?? []).forEach((r: any) => {
      const c = r.credit_customers;
      const open = r.status === 'open' || r.status === 'partially_paid';
      let s = map.get(c.id);
      if (!s) {
        s = { id: c.id, name: c.name, phone: c.phone, open_count: 0, total_due: 0, last_at: null };
        map.set(c.id, s);
      }
      if (open) {
        s.open_count += 1;
        s.total_due += Number(r.remaining_amount);
      }
      if (!s.last_at || r.opened_at > s.last_at) s.last_at = r.opened_at;
    });
    const arr = Array.from(map.values()).sort((a, b) => b.total_due - a.total_due);
    setCustomers(arr);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [profile?.company_id]);

  useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel(`co:${profile.company_id}:fiado-rt`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'credit_receivables' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'credit_payment_allocations' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [profile?.company_id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      c.name.toLowerCase().includes(q) || (c.phone ?? '').toLowerCase().includes(q),
    );
  }, [customers, query]);

  const totals = useMemo(() => {
    const totalAberto = customers.reduce((s, c) => s + c.total_due, 0);
    const clientesAbertos = customers.filter((c) => c.total_due > 0.005).length;
    return { totalAberto, clientesAbertos };
  }, [customers]);

  if (profile && branding.loaded && !branding.enableCreditAccounts) {
    return <Navigate to="/comandas" replace />;
  }

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Recebíveis</p>
          <h1 className="font-display text-3xl sm:text-4xl mt-1">Fiado · Contas penduradas</h1>
        </div>
        <div className="flex items-center gap-3 text-right">
          <div className="rounded-lg border border-border bg-card px-4 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Em aberto</div>
            <div className="font-display text-xl text-warning">{fmtBRL(totals.totalAberto)}</div>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Clientes</div>
            <div className="font-display text-xl">{totals.clientesAbertos}</div>
          </div>
        </div>
      </header>

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Buscar cliente por nome ou telefone…"
          value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Nenhum cliente com conta pendurada.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
            <div className="col-span-4">Cliente</div>
            <div className="col-span-2">Telefone</div>
            <div className="col-span-2 text-center">Comandas</div>
            <div className="col-span-2 text-right">Total devido</div>
            <div className="col-span-2 text-right">Última</div>
          </div>
          <ul className="divide-y divide-border">
            {filtered.map((c) => (
              <li key={c.id}>
                <button onClick={() => setSelectedId(c.id)}
                  className="w-full text-left hover:bg-accent/30 transition px-4 py-3 sm:grid sm:grid-cols-12 sm:gap-2 sm:items-center">
                  {/* Mobile layout */}
                  <div className="sm:hidden flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        <span className="truncate">{c.name}</span>
                        {c.total_due > 0 && c.last_at && daysSince(c.last_at) > 30 && (
                          <Badge variant="outline" className="text-[9px] text-warning border-warning/40">Atrasada</Badge>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span>{c.phone ?? 'Sem telefone'}</span>
                        <span>·</span>
                        <span>{c.open_count} comanda(s)</span>
                        {c.last_at && <><span>·</span><span>{fmtDate(c.last_at)}</span></>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <div className={cn('text-right tabular-nums font-semibold text-sm',
                        c.total_due > 0 ? 'text-warning' : 'text-success')}>{fmtBRL(c.total_due)}</div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>

                  {/* Desktop layout */}
                  <div className="hidden sm:flex col-span-4 font-medium items-center gap-2 min-w-0">
                    <span className="truncate">{c.name}</span>
                    {c.total_due > 0 && c.last_at && daysSince(c.last_at) > 30 && (
                      <Badge variant="outline" className="text-[9px] text-warning border-warning/40">Atrasada</Badge>
                    )}
                  </div>
                  <div className="hidden sm:block col-span-2 text-sm text-muted-foreground truncate">{c.phone ?? '—'}</div>
                  <div className="hidden sm:block col-span-2 text-center text-sm">{c.open_count}</div>
                  <div className={cn('hidden sm:block col-span-2 text-right tabular-nums font-semibold',
                    c.total_due > 0 ? 'text-warning' : 'text-success')}>{fmtBRL(c.total_due)}</div>
                  <div className="hidden sm:flex col-span-2 text-right text-xs text-muted-foreground items-center justify-end gap-1">
                    {c.last_at ? fmtDate(c.last_at) : '—'} <ChevronRight className="h-3 w-3" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedId && (
        <CustomerDetailDialog
          customerId={selectedId}
          open
          onOpenChange={(o) => { if (!o) { setSelectedId(null); load(); } }}
        />
      )}
    </div>
  );
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function CustomerDetailDialog({ customerId, open, onOpenChange }:
  { customerId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { profile } = useAuth();
  const [customer, setCustomer] = useState<{ name: string; phone: string | null; notes: string | null } | null>(null);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [history, setHistory] = useState<Array<{ id: string; amount: number; method: Method; created_at: string; notes: string | null }>>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<Method>('dinheiro');
  const [customAmount, setCustomAmount] = useState('');
  const [paying, setPaying] = useState(false);

  const load = async () => {
    const { data: c } = await supabase.from('credit_customers')
      .select('name, phone, notes').eq('id', customerId).maybeSingle();
    setCustomer(c ?? null);

    const { data: recs } = await supabase.from('credit_receivables')
      .select('id, original_amount, paid_amount, remaining_amount, status, opened_at, closed_at, notes, tab_id, order_id, customer_tabs(tab_number), orders(order_number)')
      .eq('customer_id', customerId)
      .order('opened_at', { ascending: false });
    setReceivables((recs ?? []).map((r: any) => ({
      id: r.id,
      original_amount: Number(r.original_amount),
      paid_amount: Number(r.paid_amount),
      remaining_amount: Number(r.remaining_amount),
      status: r.status, opened_at: r.opened_at, closed_at: r.closed_at, notes: r.notes,
      tab_id: r.tab_id, order_id: r.order_id,
      tab_number: r.customer_tabs?.tab_number ?? null,
      order_number: r.orders?.order_number ?? null,
    })));

    const { data: pays } = await supabase.from('credit_payments')
      .select('id, amount, method, created_at, notes')
      .eq('customer_id', customerId).order('created_at', { ascending: false }).limit(20);
    setHistory((pays ?? []).map((p: any) => ({ ...p, amount: Number(p.amount) })));
  };

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, customerId]);

  const openRecs = useMemo(
    () => receivables.filter((r) => r.status === 'open' || r.status === 'partially_paid'),
    [receivables],
  );

  useEffect(() => {
    setSelected(new Set(openRecs.map((r) => r.id)));
    // eslint-disable-next-line
  }, [receivables.length]);

  const selectedTotal = useMemo(
    () => openRecs.filter((r) => selected.has(r.id)).reduce((s, r) => s + r.remaining_amount, 0),
    [openRecs, selected],
  );

  const totalDue = openRecs.reduce((s, r) => s + r.remaining_amount, 0);
  const amountToPay = customAmount.trim() === ''
    ? selectedTotal
    : Math.max(0, Number(customAmount.replace(',', '.')) || 0);
  const isPartial = amountToPay > 0 && amountToPay < selectedTotal - 0.005;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const registrarPagamento = async () => {
    if (!profile) return;
    if (selected.size === 0) { toast.error('Selecione ao menos uma comanda'); return; }
    if (amountToPay <= 0) { toast.error('Valor inválido'); return; }
    if (amountToPay > selectedTotal + 0.005) { toast.error('Valor maior que o selecionado'); return; }
    setPaying(true);
    try {
      const { data: reg } = await supabase.from('cash_registers').select('id')
        .eq('company_id', profile.company_id).eq('status', 'aberto')
        .order('opened_at', { ascending: false }).limit(1).maybeSingle();

      const { data: pay, error: perr } = await supabase.from('credit_payments').insert({
        company_id: profile.company_id, customer_id: customerId,
        amount: +amountToPay.toFixed(2), method,
        register_id: reg?.id ?? null, received_by: profile.id,
        notes: null,
      }).select('id').single();
      if (perr || !pay) { toast.error(perr?.message ?? 'Erro ao registrar pagamento'); setPaying(false); return; }

      // Distribui o valor pelos recebíveis selecionados (FIFO por opened_at asc)
      const queue = openRecs
        .filter((r) => selected.has(r.id))
        .sort((a, b) => a.opened_at.localeCompare(b.opened_at));
      let remaining = +amountToPay.toFixed(2);
      const allocs: any[] = [];
      for (const r of queue) {
        if (remaining <= 0.005) break;
        const apply = Math.min(remaining, r.remaining_amount);
        if (apply <= 0) continue;
        allocs.push({
          company_id: profile.company_id,
          payment_id: pay.id,
          receivable_id: r.id,
          amount_applied: +apply.toFixed(2),
        });
        remaining = +(remaining - apply).toFixed(2);
      }
      if (allocs.length) {
        const { error: aerr } = await supabase.from('credit_payment_allocations').insert(allocs);
        if (aerr) { toast.error(aerr.message); setPaying(false); return; }
      }

      // Caixa: registra suprimento se for dinheiro e tiver caixa aberto
      if (method === 'dinheiro' && reg?.id) {
        await supabase.from('cash_movements').insert({
          company_id: profile.company_id, register_id: reg.id,
          type: 'suprimento', amount: +amountToPay.toFixed(2),
          user_id: profile.id,
          notes: `Recebimento fiado · ${customer?.name ?? ''}`,
        });
      } else if (method !== 'dinheiro' && !reg?.id) {
        // sem caixa aberto e não é dinheiro: apenas avisa
      }

      if (!reg?.id && method === 'dinheiro') {
        toast.warning('Pagamento registrado, mas nenhum caixa está aberto.');
      } else {
        toast.success('Pagamento registrado.');
      }
      setCustomAmount('');
      await load();
    } finally { setPaying(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{customer?.name ?? 'Cliente'}</DialogTitle>
          <DialogDescription>
            {customer?.phone ?? 'Sem telefone'} · Devido <strong className="text-warning">{fmtBRL(totalDue)}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-4">
          {openRecs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              <Wallet className="h-6 w-6 mx-auto mb-2 opacity-60" />
              Nenhuma conta em aberto.
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-secondary/30">
                <div className="col-span-1"></div>
                <div className="col-span-3">Comanda / Pedido</div>
                <div className="col-span-3">Aberto em</div>
                <div className="col-span-2 text-right">Original</div>
                <div className="col-span-3 text-right">Em aberto</div>
              </div>
              <ul className="divide-y divide-border">
                {openRecs.map((r) => (
                  <li key={r.id} className="grid grid-cols-12 gap-2 items-center px-3 py-2">
                    <div className="col-span-1">
                      <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                    </div>
                    <div className="col-span-3 text-sm">
                      {r.tab_number != null && <span>Comanda #{r.tab_number}</span>}
                      {r.order_number != null && <span>Pedido #{r.order_number}</span>}
                      {r.tab_number == null && r.order_number == null && <span className="text-muted-foreground">—</span>}
                      {r.status === 'partially_paid' && (
                        <Badge variant="outline" className="ml-2 text-[9px]">Parcial</Badge>
                      )}
                    </div>
                    <div className="col-span-3 text-xs text-muted-foreground">{fmtDateTime(r.opened_at)}</div>
                    <div className="col-span-2 text-right text-sm tabular-nums">{fmtBRL(r.original_amount)}</div>
                    <div className="col-span-3 text-right tabular-nums font-semibold text-warning">{fmtBRL(r.remaining_amount)}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {openRecs.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Selecionado</div>
                  <div className="font-display text-2xl">{fmtBRL(selectedTotal)}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => {
                  if (selected.size === openRecs.length) setSelected(new Set());
                  else setSelected(new Set(openRecs.map((r) => r.id)));
                }}>
                  {selected.size === openRecs.length ? 'Limpar' : 'Selecionar tudo'}
                </Button>
              </div>

              <MethodPicker method={method} onChange={setMethod} />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Valor a pagar</Label>
                  <Input value={customAmount} onChange={(e) => setCustomAmount(e.target.value)}
                    placeholder={selectedTotal.toFixed(2)} />
                  <p className="text-[10px] text-muted-foreground mt-1">Deixe em branco para pagar tudo selecionado.</p>
                </div>
                <div>
                  <Label className="text-xs">Resultado</Label>
                  <div className="rounded-md border border-border bg-background px-3 py-2 text-sm h-9 flex items-center">
                    {isPartial
                      ? <span className="text-warning">Pagamento parcial · saldo {fmtBRL(selectedTotal - amountToPay)}</span>
                      : <span className="text-success">Quita totalmente o selecionado</span>}
                  </div>
                </div>
              </div>

              {method !== 'dinheiro' && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                  Pagamentos via Pix/Cartão não geram entrada no caixa em dinheiro, mas ficam registrados no histórico de fiado.
                </div>
              )}

              <Button className="w-full" disabled={paying || amountToPay <= 0 || selected.size === 0}
                onClick={registrarPagamento}>
                Registrar pagamento {fmtBRL(amountToPay)}
              </Button>
            </div>
          )}

          {history.length > 0 && (
            <div className="rounded-lg border border-border bg-card">
              <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                Histórico de pagamentos
              </div>
              <ul className="divide-y divide-border max-h-64 overflow-y-auto">
                {history.map((h) => (
                  <li key={h.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium">{LABELS[h.method]} · {fmtBRL(h.amount)}</div>
                      <div className="text-[10px] text-muted-foreground">{fmtDateTime(h.created_at)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const LABELS: Record<Method, string> = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Débito', credito: 'Crédito' };

function MethodPicker({ method, onChange }: { method: Method; onChange: (m: Method) => void }) {
  const opts = [
    { id: 'dinheiro' as Method, label: 'Dinheiro', icon: Banknote },
    { id: 'pix' as Method, label: 'Pix', icon: QrCode },
    { id: 'debito' as Method, label: 'Débito', icon: CreditCard },
    { id: 'credito' as Method, label: 'Crédito', icon: CreditCard },
  ];
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

export default FiadoPage;
