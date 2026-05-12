import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { fmtBRL, fmtDateTime, fmtTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowDownCircle, ArrowUpCircle, Banknote, CreditCard, QrCode, Wallet, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export const Route = createFileRoute('/_app/caixa')({
  component: CaixaPage,
});

interface RegisterRow {
  id: string; opened_at: string; closed_at: string | null; opening_amount: number;
  closing_amount: number | null; expected_cash: number | null; difference: number | null;
  status: 'aberto' | 'fechado'; notes: string | null;
}
interface PaymentRow { id: string; method: string; amount: number; created_at: string; order_id: string; }
interface MovementRow { id: string; type: 'suprimento' | 'sangria'; amount: number; notes: string | null; created_at: string; }

function CaixaPage() {
  const { profile } = useAuth();
  if (profile && profile.role !== 'admin') return <Navigate to="/mesas" />;

  const [open, setOpen] = useState<RegisterRow | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [history, setHistory] = useState<RegisterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [movDialog, setMovDialog] = useState<'suprimento' | 'sangria' | null>(null);
  const [historyDetail, setHistoryDetail] = useState<RegisterRow | null>(null);

  const load = async () => {
    if (!profile) return;
    const { data: reg } = await supabase.from('cash_registers').select('*')
      .eq('company_id', profile.company_id).eq('status', 'aberto')
      .order('opened_at', { ascending: false }).limit(1).maybeSingle();
    setOpen(reg as any);
    if (reg) {
      const { data: pays } = await supabase.from('payments').select('*')
        .eq('company_id', profile.company_id).gte('created_at', reg.opened_at).order('created_at', { ascending: false });
      setPayments((pays ?? []).map((p: any) => ({ ...p, amount: Number(p.amount) })));
      const { data: mvs } = await supabase.from('cash_movements').select('*')
        .eq('register_id', reg.id).order('created_at', { ascending: false });
      setMovements((mvs ?? []).map((m: any) => ({ ...m, amount: Number(m.amount) })));
    } else {
      setPayments([]); setMovements([]);
    }
    const { data: hist } = await supabase.from('cash_registers').select('*')
      .eq('company_id', profile.company_id).eq('status', 'fechado')
      .order('opened_at', { ascending: false }).limit(10);
    setHistory((hist ?? []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile?.company_id]);
  useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel('caixa-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_registers' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_movements' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.company_id]);

  const totals = (() => {
    const byMethod: Record<string, number> = { dinheiro: 0, pix: 0, debito: 0, credito: 0 };
    for (const p of payments) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
    const supr = movements.filter((m) => m.type === 'suprimento').reduce((s, m) => s + m.amount, 0);
    const sang = movements.filter((m) => m.type === 'sangria').reduce((s, m) => s + m.amount, 0);
    const totalVendas = Object.values(byMethod).reduce((a, b) => a + b, 0);
    const expectedCash = (open?.opening_amount ?? 0) + byMethod.dinheiro + supr - sang;
    return { byMethod, supr, sang, totalVendas, expectedCash };
  })();

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Financeiro</p>
          <h1 className="font-display text-3xl sm:text-4xl mt-1">Caixa</h1>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {!open && <Button size="sm" onClick={() => setOpenDialog(true)} className="flex-1 sm:flex-none"><Wallet className="h-4 w-4 mr-1"/>Abrir caixa</Button>}
          {open && (
            <>
              <Button size="sm" variant="outline" onClick={() => setMovDialog('suprimento')} className="flex-1 sm:flex-none"><ArrowDownCircle className="h-4 w-4 mr-1"/>Suprimento</Button>
              <Button size="sm" variant="outline" onClick={() => setMovDialog('sangria')} className="flex-1 sm:flex-none"><ArrowUpCircle className="h-4 w-4 mr-1"/>Sangria</Button>
              <Button size="sm" onClick={() => setCloseDialog(true)} className="flex-1 sm:flex-none bg-primary"><Lock className="h-4 w-4 mr-1"/>Fechar</Button>
            </>
          )}
        </div>
      </header>

      {loading ? <div className="text-sm text-muted-foreground">Carregando…</div> : !open ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Wallet className="h-10 w-10 mx-auto text-muted-foreground"/>
          <p className="mt-3 text-sm text-muted-foreground">Nenhum caixa aberto. Abra um caixa para registrar pagamentos.</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card p-5 mb-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Caixa aberto</p>
                <p className="font-display text-2xl">{fmtDateTime(open.opened_at)}</p>
              </div>
              <p className="text-xs text-muted-foreground">Abertura: {fmtBRL(open.opening_amount)}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <Stat label="Dinheiro" value={fmtBRL(totals.byMethod.dinheiro)} icon={Banknote}/>
            <Stat label="Pix" value={fmtBRL(totals.byMethod.pix)} icon={QrCode}/>
            <Stat label="Débito" value={fmtBRL(totals.byMethod.debito)} icon={CreditCard}/>
            <Stat label="Crédito" value={fmtBRL(totals.byMethod.credito)} icon={CreditCard}/>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 mb-8">
            <Stat label="Total de vendas" value={fmtBRL(totals.totalVendas)} accent/>
            <Stat label="Suprimentos" value={fmtBRL(totals.supr)}/>
            <Stat label="Sangrias" value={`- ${fmtBRL(totals.sang)}`}/>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Pagamentos do caixa">
              {payments.length === 0 ? <Empty text="Nenhum pagamento ainda."/> : (
                <ul className="divide-y divide-border text-sm">
                  {payments.map((p) => (
                    <li key={p.id} className="flex justify-between py-2">
                      <span className="text-muted-foreground">{fmtTime(p.created_at)} · <span className="capitalize">{p.method}</span></span>
                      <span className="font-medium tabular-nums">{fmtBRL(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Movimentos">
              {movements.length === 0 ? <Empty text="Nenhum movimento."/> : (
                <ul className="divide-y divide-border text-sm">
                  {movements.map((m) => (
                    <li key={m.id} className="flex justify-between py-2">
                      <div>
                        <span className={cn('font-medium capitalize', m.type === 'suprimento' ? 'text-success' : 'text-danger')}>{m.type}</span>
                        <span className="text-muted-foreground"> · {fmtTime(m.created_at)}{m.notes ? ` · ${m.notes}` : ''}</span>
                      </div>
                      <span className="tabular-nums">{m.type === 'suprimento' ? '+' : '-'} {fmtBRL(m.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}

      {history.length > 0 && (
        <div className="mt-10">
          <h2 className="font-display text-xl mb-3">Histórico recente</h2>
          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-secondary/40">
                <tr><th className="text-left px-4 py-2.5">Abertura</th><th className="text-left px-4 py-2.5">Fechamento</th><th className="text-right px-4 py-2.5">Esperado</th><th className="text-right px-4 py-2.5">Informado</th><th className="text-right px-4 py-2.5">Diferença</th></tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} onClick={() => setHistoryDetail(r)} className="border-t border-border cursor-pointer hover:bg-secondary/40">
                    <td className="px-4 py-2.5">{fmtDateTime(r.opened_at)}</td>
                    <td className="px-4 py-2.5">{r.closed_at ? fmtDateTime(r.closed_at) : '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtBRL(r.expected_cash ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtBRL(r.closing_amount ?? 0)}</td>
                    <td className={cn('px-4 py-2.5 text-right tabular-nums font-medium',
                      (r.difference ?? 0) === 0 ? '' : (r.difference ?? 0) > 0 ? 'text-success' : 'text-danger')}>
                      {fmtBRL(r.difference ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <OpenRegisterDialog open={openDialog} onOpenChange={setOpenDialog} onDone={load}/>
      {open && (
        <CloseRegisterDialog open={closeDialog} onOpenChange={setCloseDialog}
          register={open} expected={totals.expectedCash} onDone={load}/>
      )}
      {open && movDialog && (
        <MovementDialog open onOpenChange={() => setMovDialog(null)}
          type={movDialog} registerId={open.id} onDone={load}/>
      )}
      {historyDetail && (
        <RegisterDetailDialog register={historyDetail} onClose={() => setHistoryDetail(null)} companyId={profile!.company_id}/>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon, accent }: any) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        {Icon && <Icon className={`h-4 w-4 ${accent ? 'text-accent' : 'text-muted-foreground'}`}/>}
      </div>
      <div className={cn('mt-2 font-display text-2xl', accent && 'text-accent')}>{value}</div>
    </div>
  );
}
function Card({ title, children }: any) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="font-display text-lg mb-3">{title}</h3>
      {children}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="text-sm text-muted-foreground py-6 text-center">{text}</div>;
}

function OpenRegisterDialog({ open, onOpenChange, onDone }: any) {
  const { profile } = useAuth();
  const [amount, setAmount] = useState('0');
  const [notes, setNotes] = useState('');
  const submit = async () => {
    if (!profile) return;
    const { error } = await supabase.from('cash_registers').insert({
      company_id: profile.company_id, opened_by: profile.id,
      opening_amount: Number(amount.replace(',', '.')) || 0, notes: notes || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Caixa aberto.'); onOpenChange(false); setAmount('0'); setNotes(''); onDone();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Abrir caixa</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Valor de abertura (R$)</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)}/></div>
          <div><Label>Observações</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}/></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit}>Abrir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseRegisterDialog({ open, onOpenChange, register, expected, onDone }: any) {
  const { profile } = useAuth();
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  useEffect(() => { if (open) setAmount(String(expected.toFixed(2))); }, [open, expected]);
  const informed = Number(amount.replace(',', '.')) || 0;
  const diff = informed - expected;
  const submit = async () => {
    if (!profile) return;
    const { error } = await supabase.from('cash_registers').update({
      status: 'fechado', closed_at: new Date().toISOString(), closed_by: profile.id,
      closing_amount: informed, expected_cash: expected, difference: diff,
      notes: notes || register.notes,
    }).eq('id', register.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Caixa fechado.'); onOpenChange(false); onDone();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Fechar caixa</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex justify-between rounded-lg bg-secondary/40 p-3 text-sm">
            <span className="text-muted-foreground">Esperado em dinheiro</span>
            <span className="font-semibold tabular-nums">{fmtBRL(expected)}</span>
          </div>
          <div><Label>Valor conferido em caixa (R$)</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)}/></div>
          <div className={cn('flex justify-between rounded-lg p-3 text-sm', diff === 0 ? 'bg-secondary/40' : diff > 0 ? 'bg-success/10' : 'bg-danger/10')}>
            <span>Diferença</span>
            <span className="font-semibold tabular-nums">{fmtBRL(diff)}</span>
          </div>
          <div><Label>Observações</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}/></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} className="bg-primary">Confirmar fechamento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MovementDialog({ open, onOpenChange, type, registerId, onDone }: any) {
  const { profile } = useAuth();
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const submit = async () => {
    if (!profile) return;
    const v = Number(amount.replace(',', '.'));
    if (!v || v <= 0) { toast.error('Valor inválido'); return; }
    const { error } = await supabase.from('cash_movements').insert({
      company_id: profile.company_id, register_id: registerId, type, amount: v,
      user_id: profile.id, notes: notes || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Movimento registrado.'); onOpenChange(false); setAmount(''); setNotes(''); onDone();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="capitalize">{type}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Valor (R$)</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00"/></div>
          <div><Label>Motivo</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}/></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit}>Lançar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegisterDetailDialog({ register, onClose, companyId }: { register: RegisterRow; onClose: () => void; companyId: string }) {
  const [pays, setPays] = useState<PaymentRow[]>([]);
  const [mvs, setMvs] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const upper = register.closed_at ?? new Date().toISOString();
      const [{ data: p }, { data: m }] = await Promise.all([
        supabase.from('payments').select('*').eq('company_id', companyId)
          .gte('created_at', register.opened_at).lte('created_at', upper)
          .order('created_at', { ascending: false }),
        supabase.from('cash_movements').select('*').eq('register_id', register.id)
          .order('created_at', { ascending: false }),
      ]);
      setPays((p ?? []).map((x: any) => ({ ...x, amount: Number(x.amount) })));
      setMvs((m ?? []).map((x: any) => ({ ...x, amount: Number(x.amount) })));
      setLoading(false);
    })();
  }, [register.id]);

  const byMethod: Record<string, number> = { dinheiro: 0, pix: 0, debito: 0, credito: 0 };
  for (const p of pays) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
  const supr = mvs.filter((m) => m.type === 'suprimento').reduce((s, m) => s + m.amount, 0);
  const sang = mvs.filter((m) => m.type === 'sangria').reduce((s, m) => s + m.amount, 0);
  const totalVendas = Object.values(byMethod).reduce((a, b) => a + b, 0);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-baseline gap-2">
            <span>Caixa de {fmtDateTime(register.opened_at)}</span>
          </DialogTitle>
        </DialogHeader>
        {loading ? <div className="text-sm text-muted-foreground">Carregando…</div> : (
          <div className="max-h-[70vh] overflow-y-auto space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <Mini label="Dinheiro" value={fmtBRL(byMethod.dinheiro)}/>
              <Mini label="Pix" value={fmtBRL(byMethod.pix)}/>
              <Mini label="Débito" value={fmtBRL(byMethod.debito)}/>
              <Mini label="Crédito" value={fmtBRL(byMethod.credito)}/>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <Mini label="Total vendas" value={fmtBRL(totalVendas)} accent/>
              <Mini label="Suprimentos" value={fmtBRL(supr)}/>
              <Mini label="Sangrias" value={`- ${fmtBRL(sang)}`}/>
              <Mini label="Diferença" value={fmtBRL(register.difference ?? 0)}/>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Card title="Pagamentos">
                {pays.length === 0 ? <Empty text="Nenhum pagamento."/> : (
                  <ul className="divide-y divide-border text-sm">
                    {pays.map((p) => (
                      <li key={p.id} className="flex justify-between py-1.5">
                        <span className="text-muted-foreground">{fmtTime(p.created_at)} · <span className="capitalize">{p.method}</span></span>
                        <span className="tabular-nums">{fmtBRL(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title="Movimentos">
                {mvs.length === 0 ? <Empty text="Nenhum movimento."/> : (
                  <ul className="divide-y divide-border text-sm">
                    {mvs.map((m) => (
                      <li key={m.id} className="flex justify-between py-1.5">
                        <div>
                          <span className={cn('font-medium capitalize', m.type === 'suprimento' ? 'text-success' : 'text-danger')}>{m.type}</span>
                          <span className="text-muted-foreground"> · {fmtTime(m.created_at)}{m.notes ? ` · ${m.notes}` : ''}</span>
                        </div>
                        <span className="tabular-nums">{m.type === 'suprimento' ? '+' : '-'} {fmtBRL(m.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
            {register.notes && (
              <div className="rounded-lg bg-secondary/40 p-3 text-sm">
                <span className="text-muted-foreground text-xs uppercase tracking-wider">Observações</span>
                <p className="mt-1">{register.notes}</p>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose} variant="outline">Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('mt-1 font-semibold tabular-nums', accent && 'text-accent')}>{value}</div>
    </div>
  );
}
