import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { fmtBRL, fmtDateTime, minutesSince } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Clock, Users, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ComandaSheet } from '@/components/comanda-sheet';
import { useTenantBranding } from '@/hooks/use-tenant-branding';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

type Status = 'todas' | 'aberta' | 'aguardando_pagamento' | 'paga' | 'cancelada';

interface TabRow {
  id: string; tab_number: number; customer_name: string | null;
  status: 'aberta' | 'aguardando_pagamento' | 'paga' | 'cancelada';
  subtotal: number; total: number; paid_amount: number;
  opened_at: string; closed_at: string | null;
  items_count: number;
  is_credit: boolean;
}

function ComandasPage() {
  const { profile } = useAuth();
  const { tabNumberingMode } = useTenantBranding();
  const isAdmin = profile?.role === 'admin';
  const [tabs, setTabs] = useState<TabRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>('aberta');
  const [search, setSearch] = useState('');
  const [openTabId, setOpenTabId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualNum, setManualNum] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualBusy, setManualBusy] = useState(false);

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('customer_tabs')
      .select('id, tab_number, customer_name, status, subtotal, total, paid_amount, opened_at, closed_at, is_credit, tab_items(id)')
      .eq('company_id', profile.company_id)
      .order('opened_at', { ascending: false })
      .limit(200);
    setTabs((data ?? []).map((t: any) => ({
      id: t.id, tab_number: t.tab_number, customer_name: t.customer_name, status: t.status,
      subtotal: Number(t.subtotal), total: Number(t.total), paid_amount: Number(t.paid_amount),
      opened_at: t.opened_at, closed_at: t.closed_at, is_credit: !!t.is_credit,
      items_count: (t.tab_items ?? []).length,
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile?.company_id]);

  useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel(`co:${profile.company_id}:comandas-rt`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_tabs' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_items' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_payments' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.company_id]);

  const filtered = useMemo(() => {
    let arr = tabs;
    if (status !== 'todas') arr = arr.filter((t) => t.status === status);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter((t) => String(t.tab_number).includes(q) || (t.customer_name ?? '').toLowerCase().includes(q));
    }
    return arr;
  }, [tabs, status, search]);

  const counts = useMemo(() => {
    return {
      aberta: tabs.filter((t) => t.status === 'aberta').length,
      aguardando_pagamento: tabs.filter((t) => t.status === 'aguardando_pagamento').length,
      paga: tabs.filter((t) => t.status === 'paga').length,
      cancelada: tabs.filter((t) => t.status === 'cancelada').length,
    };
  }, [tabs]);

  const createTabAuto = async () => {
    if (!profile) return;
    const { data, error } = await supabase.from('customer_tabs').insert({
      company_id: profile.company_id, opened_by: profile.id, status: 'aberta',
    }).select('id').single();
    if (error || !data) { toast.error(error?.message ?? 'Erro'); return; }
    setOpenTabId(data.id);
  };

  const onNovaComanda = () => {
    if (tabNumberingMode === 'manual') {
      setManualNum('');
      setManualName('');
      setManualOpen(true);
    } else {
      void createTabAuto();
    }
  };

  const confirmManual = async () => {
    if (!profile) return;
    const n = Number(manualNum);
    if (!Number.isInteger(n) || n <= 0) { toast.error('Informe um número válido'); return; }
    setManualBusy(true);
    try {
      // Bloqueia número repetido entre comandas em aberto/aguardando pagamento
      const { data: dup } = await supabase
        .from('customer_tabs')
        .select('id')
        .eq('company_id', profile.company_id)
        .eq('tab_number', n)
        .in('status', ['aberta', 'aguardando_pagamento'])
        .maybeSingle();
      if (dup) { toast.error(`Comanda #${n} já está aberta`); setManualBusy(false); return; }

      const { data, error } = await supabase.from('customer_tabs').insert({
        company_id: profile.company_id, opened_by: profile.id, status: 'aberta',
        tab_number: n, customer_name: manualName.trim() || null,
      }).select('id').single();
      if (error || !data) { toast.error(error?.message ?? 'Erro'); setManualBusy(false); return; }
      setManualOpen(false);
      setOpenTabId(data.id);
    } finally {
      setManualBusy(false);
    }
  };


  const cancelTab = async (id: string) => {
    if (!confirm('Cancelar esta comanda? Itens permanecem registrados.')) return;
    await supabase.from('customer_tabs').update({
      status: 'cancelada', closed_at: new Date().toISOString(), closed_by: profile?.id,
    }).eq('id', id);
    toast.success('Comanda cancelada');
    load();
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">PDV leve</p>
          <h1 className="font-display text-3xl sm:text-4xl mt-1">Comandas</h1>
        </div>
        <Button onClick={onNovaComanda}><Plus className="h-4 w-4 mr-1" />Nova comanda</Button>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusChip active={status === 'aberta'} onClick={() => setStatus('aberta')} label="Abertas" count={counts.aberta} tone="warning" />
        <StatusChip active={status === 'aguardando_pagamento'} onClick={() => setStatus('aguardando_pagamento')} label="Aguard. pgto" count={counts.aguardando_pagamento} />
        <StatusChip active={status === 'paga'} onClick={() => setStatus('paga')} label="Pagas" count={counts.paga} tone="success" />
        <StatusChip active={status === 'cancelada'} onClick={() => setStatus('cancelada')} label="Canceladas" count={counts.cancelada} />
        <StatusChip active={status === 'todas'} onClick={() => setStatus('todas')} label="Todas" count={tabs.length} />
        <div className="ml-auto relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nº ou cliente" className="pl-8 w-56" />
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Nenhuma comanda neste filtro.
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <div key={t.id} className={cn('rounded-2xl border bg-card p-4 transition-all hover:shadow-elevated',
              t.status === 'aberta' && 'border-warning/40',
              t.status === 'paga' && 'border-success/40',
              t.status === 'cancelada' && 'opacity-60')}>
              <button onClick={() => setOpenTabId(t.id)} className="text-left w-full">
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-2xl">#{t.tab_number}</span>
                  <StatusBadge status={t.status} />
                </div>
                <div className="mt-1 text-sm text-muted-foreground truncate">
                  {t.customer_name || 'Sem cliente'}
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <div className="text-lg font-semibold tabular-nums">{fmtBRL(t.total)}</div>
                  {t.paid_amount > 0 && t.paid_amount < t.total && (
                    <span className="text-[11px] text-warning">Pago {fmtBRL(t.paid_amount)}</span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{t.items_count} itens</span>
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />
                    {t.status === 'paga' && t.closed_at ? fmtDateTime(t.closed_at) : `${minutesSince(t.opened_at)}min`}
                  </span>
                </div>
              </button>
              {isAdmin && (t.status === 'aberta' || t.status === 'aguardando_pagamento') && (
                <Button variant="ghost" size="sm" onClick={() => cancelTab(t.id)}
                  className="mt-3 w-full text-destructive hover:text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-3 w-3 mr-1" /> Cancelar comanda
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {openTabId && (
        <ComandaSheet tabId={openTabId} open onOpenChange={(o) => { if (!o) { setOpenTabId(null); load(); } }} />
      )}

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Nova comanda</DialogTitle>
            <DialogDescription>
              Numeração manual ativa — informe o número da comanda física.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="manual-num">Número *</Label>
              <Input
                id="manual-num"
                type="number"
                min={1}
                inputMode="numeric"
                autoFocus
                value={manualNum}
                onChange={(e) => setManualNum(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !manualBusy) void confirmManual(); }}
                placeholder="ex: 12"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-name">Cliente (opcional)</Label>
              <Input
                id="manual-name"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Nome do cliente"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)} disabled={manualBusy}>Cancelar</Button>
            <Button onClick={confirmManual} disabled={manualBusy}>Abrir comanda</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusChip({ active, onClick, label, count, tone }: { active: boolean; onClick: () => void; label: string; count: number; tone?: 'success' | 'warning' }) {
  return (
    <button onClick={onClick}
      className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition',
        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-foreground/40')}>
      <span>{label}</span>
      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
        active ? 'bg-primary-foreground/20' :
        tone === 'success' ? 'bg-success/15 text-success' :
        tone === 'warning' ? 'bg-warning/15 text-warning' :
        'bg-muted text-foreground')}>{count}</span>
    </button>
  );
}

function StatusBadge({ status }: { status: TabRow['status'] }) {
  const cfg: Record<TabRow['status'], { label: string; cls: string }> = {
    aberta: { label: 'Aberta', cls: 'bg-warning/20 text-warning-foreground' },
    aguardando_pagamento: { label: 'Aguard. pgto', cls: 'bg-accent/20 text-accent-foreground' },
    paga: { label: 'Paga', cls: 'bg-success text-success-foreground' },
    cancelada: { label: 'Cancelada', cls: 'bg-destructive/15 text-destructive' },
  };
  const c = cfg[status];
  return <Badge className={cn('text-[10px]', c.cls)}>{c.label}</Badge>;
}

export default ComandasPage;
