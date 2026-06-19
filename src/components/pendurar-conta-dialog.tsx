import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { fmtBRL } from '@/lib/format';
import { toast } from 'sonner';
import { UserPlus, Search } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  source: { kind: 'tab'; tabId: string } | { kind: 'order'; orderId: string; tableId: string };
  amount: number;
  onSuccess?: () => void;
}

interface Customer { id: string; name: string; phone: string | null; }

export function PendurarContaDialog({ open, onOpenChange, source, amount, onSuccess }: Props) {
  const { profile } = useAuth();
  const [mode, setMode] = useState<'pick' | 'new'>('pick');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) { setMode('pick'); setQuery(''); setResults([]); setSelected(null); setName(''); setPhone(''); setNotes(''); }
  }, [open]);

  useEffect(() => {
    if (!open || !profile || mode !== 'pick') return;
    let cancel = false;
    (async () => {
      const q = query.trim();
      let req = supabase.from('credit_customers').select('id, name, phone')
        .eq('company_id', profile.company_id).order('name').limit(20);
      if (q) req = req.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
      const { data } = await req;
      if (!cancel) setResults((data ?? []) as Customer[]);
    })();
    return () => { cancel = true; };
  }, [open, query, profile?.company_id, mode]);

  const canConfirm = useMemo(() => {
    if (mode === 'pick') return !!selected;
    return name.trim().length > 0;
  }, [mode, selected, name]);

  const confirm = async () => {
    if (!profile || amount <= 0) return;
    setBusy(true);
    try {
      let customerId = selected?.id;
      if (mode === 'new') {
        const { data, error } = await supabase.from('credit_customers').insert({
          company_id: profile.company_id, name: name.trim(),
          phone: phone.trim() || null, notes: null,
        }).select('id').single();
        if (error || !data) { toast.error(error?.message ?? 'Erro ao cadastrar cliente'); setBusy(false); return; }
        customerId = data.id;
      }
      if (!customerId) { setBusy(false); return; }

      // 1) cria receivable
      const { error: rerr } = await supabase.from('credit_receivables').insert({
        company_id: profile.company_id,
        customer_id: customerId,
        tab_id: source.kind === 'tab' ? source.tabId : null,
        order_id: source.kind === 'order' ? source.orderId : null,
        original_amount: +amount.toFixed(2),
        remaining_amount: +amount.toFixed(2),
        status: 'open',
        created_by: profile.id,
        notes: notes.trim() || null,
      });
      if (rerr) { toast.error(rerr.message); setBusy(false); return; }

      // 2) fecha a origem marcando is_credit
      if (source.kind === 'tab') {
        await supabase.from('customer_tabs').update({
          status: 'paga', is_credit: true,
          closed_at: new Date().toISOString(), closed_by: profile.id,
        }).eq('id', source.tabId);
      } else {
        await supabase.from('orders').update({
          status: 'fechado', is_credit: true,
          closed_at: new Date().toISOString(),
        }).eq('id', source.orderId);
        await supabase.from('tables').update({ status: 'livre' }).eq('id', source.tableId);
      }

      toast.success('Conta pendurada com sucesso');
      onOpenChange(false);
      onSuccess?.();
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Pendurar conta</DialogTitle>
          <DialogDescription>
            Valor a pendurar: <strong className="text-foreground">{fmtBRL(amount)}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Button variant={mode === 'pick' ? 'default' : 'outline'} size="sm" className="flex-1"
            onClick={() => setMode('pick')}><Search className="h-4 w-4 mr-1" />Cliente existente</Button>
          <Button variant={mode === 'new' ? 'default' : 'outline'} size="sm" className="flex-1"
            onClick={() => setMode('new')}><UserPlus className="h-4 w-4 mr-1" />Novo cliente</Button>
        </div>

        {mode === 'pick' ? (
          <div className="space-y-2">
            <Input autoFocus placeholder="Buscar por nome ou telefone…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y">
              {results.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  Nenhum cliente encontrado. Cadastre um novo.
                </div>
              ) : results.map((c) => (
                <button key={c.id} type="button" onClick={() => setSelected(c)}
                  className={`w-full text-left p-3 hover:bg-accent/40 ${selected?.id === c.id ? 'bg-accent/30' : ''}`}>
                  <div className="text-sm font-medium">{c.name}</div>
                  {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div><Label>Nome *</Label><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do cliente" /></div>
            <div><Label>Telefone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" /></div>
          </div>
        )}

        <div>
          <Label className="text-xs text-muted-foreground">Observação (opcional)</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: paga sexta-feira" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={confirm} disabled={!canConfirm || busy}>
            Pendurar {fmtBRL(amount)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
