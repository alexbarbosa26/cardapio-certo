import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { fmtBRL, minutesSince } from '@/lib/format';
import { Plus, Users, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { OrderSheet } from '@/components/order-sheet';
import { CheckoutDialog } from '@/components/checkout-dialog';
import { toast } from 'sonner';

interface MesaCard {
  id: string;
  name: string;
  number: number;
  status: string;
  open_order_id: string | null;
  open_total: number;
  opened_at: string | null;
  items_count: number;
}

function MesasPage() {
  const { profile } = useAuth();
  const [mesas, setMesas] = useState<MesaCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderSheet, setOrderSheet] = useState<{ tableId: string; orderId: string | null; tableName: string; createdNow: boolean } | null>(null);
  const [checkout, setCheckout] = useState<{ orderId: string; tableId: string; tableName: string } | null>(null);

  const load = async () => {
    if (!profile) return;
    const { data: tables } = await supabase
      .from('tables').select('*').eq('company_id', profile.company_id).order('number');
    const { data: orders } = await supabase
      .from('orders').select('id, table_id, total, opened_at, order_items(id)')
      .eq('company_id', profile.company_id).eq('status', 'aberto');

    const map: MesaCard[] = (tables ?? []).map((t: any) => {
      const o = (orders ?? []).find((x: any) => x.table_id === t.id);
      return {
        id: t.id, name: t.name, number: t.number, status: t.status,
        open_order_id: o?.id ?? null,
        open_total: Number(o?.total ?? 0),
        opened_at: o?.opened_at ?? null,
        items_count: o?.order_items?.length ?? 0,
      };
    });
    setMesas(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile?.company_id]);

  // realtime
  useEffect(() => {
    if (!profile) return;
    const ch = supabase
      .channel(`co:${profile.company_id}:mesas-rt`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.company_id]);

  // Auto-tick
  useEffect(() => {
    const t = setInterval(() => setMesas((m) => [...m]), 30000);
    return () => clearInterval(t);
  }, []);

  const openMesa = async (m: MesaCard) => {
    if (!profile) return;
    let orderId = m.open_order_id;
    let createdNow = false;
    if (!orderId) {
      const { data, error } = await supabase.from('orders').insert({
        company_id: profile.company_id, table_id: m.id, user_id: profile.id,
        service_fee_percentage: 10,
      }).select('id').single();
      if (error) { toast.error(error.message); return; }
      orderId = data.id;
      createdNow = true;
      await supabase.from('tables').update({ status: 'ocupada' }).eq('id', m.id);
    }
    setOrderSheet({ tableId: m.id, orderId, tableName: m.name, createdNow });
  };

  const handleSheetClose = async () => {
    if (!orderSheet?.orderId) { setOrderSheet(null); load(); return; }
    const { count } = await supabase
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderSheet.orderId);
    if ((count ?? 0) === 0) {
      await supabase.from('orders').delete().eq('id', orderSheet.orderId);
      await supabase.from('tables').update({ status: 'livre' }).eq('id', orderSheet.tableId);
    }
    setOrderSheet(null);
    load();
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Operação</p>
          <h1 className="font-display text-3xl sm:text-4xl mt-1">Mesas</h1>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Legend color="bg-success" label="Livre" />
          <Legend color="bg-accent" label="Ocupada" />
          <Legend color="bg-warning" label="Aguardando" />
        </div>
      </header>

      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : mesas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Nenhuma mesa cadastrada.
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {mesas.map((m) => {
            const ocupada = !!m.open_order_id;
            return (
              <button
                key={m.id}
                onClick={() => openMesa(m)}
                className={cn(
                  'group relative text-left rounded-2xl border bg-card p-4 transition-all',
                  'hover:shadow-elevated hover:-translate-y-0.5',
                  ocupada ? 'border-accent/40' : 'border-border',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-2xl">{String(m.number).padStart(2, '0')}</span>
                  <span className={cn(
                    'h-2 w-2 rounded-full',
                    ocupada ? 'bg-accent' : 'bg-success',
                  )} />
                </div>
                <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{ocupada ? 'Ocupada' : 'Livre'}</div>

                {ocupada ? (
                  <div className="mt-4 space-y-1.5">
                    <div className="text-lg font-semibold">{fmtBRL(m.open_total)}</div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{m.items_count} itens</span>
                      {m.opened_at && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{minutesSince(m.opened_at)}min</span>}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex items-center gap-2 text-sm text-accent-foreground/80">
                    <Plus className="h-4 w-4" /> Abrir
                  </div>
                )}

                {ocupada && (
                  <Button
                    size="sm" variant="outline"
                    onClick={(e) => { e.stopPropagation(); setCheckout({ orderId: m.open_order_id!, tableId: m.id, tableName: m.name }); }}
                    className="mt-3 w-full text-xs"
                  >
                    Fechar conta
                  </Button>
                )}
              </button>
            );
          })}
        </div>
      )}

      {orderSheet && (
        <OrderSheet
          tableId={orderSheet.tableId}
          orderId={orderSheet.orderId!}
          tableName={orderSheet.tableName}
          open
          onOpenChange={(o) => { if (!o) handleSheetClose(); }}
        />
      )}
      {checkout && (
        <CheckoutDialog
          orderId={checkout.orderId}
          tableId={checkout.tableId}
          tableName={checkout.tableName}
          open
          onOpenChange={(o) => { if (!o) { setCheckout(null); load(); } }}
        />
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-full', color)} /> {label}
    </span>
  );
}

export default MesasPage;
