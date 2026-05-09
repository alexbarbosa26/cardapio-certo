import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { fmtTime, minutesSince } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Clock, Play, CheckCircle2, Truck, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export const Route = createFileRoute('/_app/cozinha')({
  component: CozinhaPage,
});

interface KitchenItem {
  id: string;
  product_name: string;
  quantity: number;
  notes: string | null;
  kitchen_status: string;
  sent_to_kitchen_at: string;
  options: { option_group_name: string; option_item_name: string }[];
  table_name: string;
  order_number: number;
}

interface Settings { kitchen_warning_minutes: number; kitchen_danger_minutes: number; }

function CozinhaPage() {
  const { profile } = useAuth();
  const [items, setItems] = useState<KitchenItem[]>([]);
  const [settings, setSettings] = useState<Settings>({ kitchen_warning_minutes: 10, kitchen_danger_minutes: 20 });
  const [, force] = useState(0);

  const load = async () => {
    if (!profile) return;
    const { data: s } = await supabase.from('settings').select('kitchen_warning_minutes, kitchen_danger_minutes').eq('company_id', profile.company_id).maybeSingle();
    if (s) setSettings(s as any);

    const { data } = await supabase
      .from('order_items')
      .select('id, product_name, quantity, notes, kitchen_status, sent_to_kitchen_at, order_item_options(option_group_name, option_item_name), orders!inner(order_number, company_id, tables(name))')
      .in('kitchen_status', ['aguardando', 'preparo', 'pronto'])
      .eq('sends_to_kitchen', true)
      .eq('orders.company_id', profile.company_id)
      .order('sent_to_kitchen_at', { ascending: true });

    setItems((data ?? []).map((r: any) => ({
      id: r.id, product_name: r.product_name, quantity: r.quantity, notes: r.notes,
      kitchen_status: r.kitchen_status, sent_to_kitchen_at: r.sent_to_kitchen_at,
      options: r.order_item_options ?? [],
      table_name: r.orders?.tables?.name ?? '—',
      order_number: r.orders?.order_number ?? 0,
    })));
  };

  useEffect(() => { load(); }, [profile?.company_id]);

  useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel('kds')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.company_id]);

  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const setStatus = async (id: string, status: string) => {
    const updates: any = { kitchen_status: status };
    if (status === 'preparo') updates.started_preparation_at = new Date().toISOString();
    if (status === 'pronto') updates.ready_at = new Date().toISOString();
    if (status === 'entregue') updates.delivered_at = new Date().toISOString();
    if (status === 'cancelado') updates.canceled_at = new Date().toISOString();
    await supabase.from('order_items').update(updates).eq('id', id);
    toast.success('Atualizado');
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Painel da cozinha</p>
          <h1 className="font-display text-3xl sm:text-4xl mt-1">KDS</h1>
        </div>
        <div className="text-xs text-muted-foreground">
          Alerta amarelo a partir de <b>{settings.kitchen_warning_minutes} min</b>, vermelho a partir de <b>{settings.kitchen_danger_minutes} min</b>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Nenhum pedido na cozinha. Tudo em ordem.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((it) => {
            const mins = minutesSince(it.sent_to_kitchen_at);
            const danger = mins >= settings.kitchen_danger_minutes;
            const warn = !danger && mins >= settings.kitchen_warning_minutes;
            return (
              <div key={it.id} className={cn(
                'rounded-xl border bg-card p-4 transition shadow-card',
                danger && 'border-destructive/60 bg-destructive/5',
                warn && 'border-warning/60 bg-warning/10',
                !warn && !danger && 'border-border',
              )}>
                <div className="flex items-baseline justify-between">
                  <div className="font-display text-xl">{it.table_name}</div>
                  <span className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-mono tabular-nums',
                    danger ? 'bg-destructive text-destructive-foreground' : warn ? 'bg-warning text-warning-foreground' : 'bg-muted text-muted-foreground',
                  )}>
                    <Clock className="h-3 w-3" /> {mins}min
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">#{String(it.order_number).padStart(4,'0')} · {fmtTime(it.sent_to_kitchen_at)}</div>

                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-mono text-lg font-semibold">{it.quantity}×</span>
                  <span className="text-base font-medium leading-tight">{it.product_name}</span>
                </div>
                {it.options.length > 0 && (
                  <ul className="mt-2 text-xs text-muted-foreground space-y-0.5">
                    {it.options.map((o, i) => <li key={i}>• {o.option_group_name}: {o.option_item_name}</li>)}
                  </ul>
                )}
                {it.notes && (
                  <div className="mt-2 rounded-md bg-warning/15 px-2 py-1 text-[11px] italic text-warning-foreground">"{it.notes}"</div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {it.kitchen_status === 'aguardando' && (
                    <Button size="sm" onClick={() => setStatus(it.id, 'preparo')} className="bg-primary"><Play className="h-3.5 w-3.5 mr-1" /> Iniciar</Button>
                  )}
                  {it.kitchen_status === 'preparo' && (
                    <Button size="sm" onClick={() => setStatus(it.id, 'pronto')} className="bg-success text-success-foreground hover:bg-success/90"><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Pronto</Button>
                  )}
                  {it.kitchen_status === 'pronto' && (
                    <Button size="sm" onClick={() => setStatus(it.id, 'entregue')} variant="outline"><Truck className="h-3.5 w-3.5 mr-1" /> Entregue</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setStatus(it.id, 'cancelado')} className="text-muted-foreground hover:text-destructive ml-auto">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
