import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { fmtTime, minutesSince } from '@/lib/format';
import { BusyButton } from '@/components/busy-button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Clock, Play, CheckCircle2, Truck, Bell, BellOff, Utensils, Bike, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { groupItems } from '@/lib/group-items';

const SOUND_PREF_KEY = 'kds:sound-enabled';

/** Synthesize a soft bell "ding" via Web Audio so we don't need any asset. */
function playBell(ctx: AudioContext) {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.35, now + 0.01);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
  master.connect(ctx.destination);

  // Two partials = bell-ish timbre, gentle (not piercing).
  [880, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 1 : 0.45;
    osc.connect(g).connect(master);
    osc.start(now);
    osc.stop(now + 1.6);
  });
}

interface KitchenItem {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  notes: string | null;
  kitchen_status: string;
  sent_to_kitchen_at: string;
  item_type: string | null;
  weight_grams: number | null;
  options: { option_group_name: string; option_item_name: string }[];
  order_id: string;
  order_number: number;
  table_name: string | null;
  customer_name: string | null;
  origin: string;
  service_mode: string;
}

/** Um "ticket": itens de um mesmo pedido que estão no mesmo status. */
interface Ticket {
  key: string;
  order_id: string;
  order_number: number;
  status: string;
  origin: string;
  service_mode: string;
  table_name: string | null;
  customer_name: string | null;
  since: string;
  itemIds: string[];
  lines: { key: string; quantity: number; name: string; notes: string | null; options: { option_group_name: string; option_item_name: string }[] }[];
}

interface Settings { kitchen_warning_minutes: number; kitchen_danger_minutes: number; }

function buildTickets(items: KitchenItem[]): Ticket[] {
  const byTicket = new Map<string, KitchenItem[]>();
  for (const it of items) {
    const k = `${it.order_id}§${it.kitchen_status}`;
    const arr = byTicket.get(k);
    if (arr) arr.push(it); else byTicket.set(k, [it]);
  }
  const tickets: Ticket[] = [];
  for (const [key, list] of byTicket) {
    const first = list[0];
    const grouped = groupItems(list);
    tickets.push({
      key,
      order_id: first.order_id,
      order_number: first.order_number,
      status: first.kitchen_status,
      origin: first.origin,
      service_mode: first.service_mode,
      table_name: first.table_name,
      customer_name: first.customer_name,
      since: list.reduce((min, i) => (i.sent_to_kitchen_at < min ? i.sent_to_kitchen_at : min), first.sent_to_kitchen_at),
      itemIds: list.map((i) => i.id),
      lines: grouped.map((g) => ({
        key: g.key,
        quantity: g.quantity,
        name: g.first.item_type === 'peso' && g.first.weight_grams
          ? `${g.first.product_name} (${(g.first.weight_grams / 1000).toFixed(3)} kg)`
          : g.first.product_name,
        notes: g.first.notes,
        options: g.first.options,
      })),
    });
  }
  // Mais antigos primeiro.
  return tickets.sort((a, b) => a.since.localeCompare(b.since));
}

function CozinhaPage() {
  const { profile } = useAuth();
  const [items, setItems] = useState<KitchenItem[]>([]);
  const [settings, setSettings] = useState<Settings>({ kitchen_warning_minutes: 10, kitchen_danger_minutes: 20 });
  const [, force] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SOUND_PREF_KEY) === '1';
  });
  const knownIdsRef = useRef<Set<string> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  const ensureAudio = () => {
    if (!audioCtxRef.current) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (Ctor) audioCtxRef.current = new Ctor();
    }
    if (audioCtxRef.current?.state === 'suspended') void audioCtxRef.current.resume();
    return audioCtxRef.current;
  };

  const toggleSound = (on: boolean) => {
    setSoundEnabled(on);
    window.localStorage.setItem(SOUND_PREF_KEY, on ? '1' : '0');
    if (on) {
      const ctx = ensureAudio();
      if (ctx) playBell(ctx); // test chime + unlocks audio on user gesture
    }
  };

  const load = async () => {
    if (!profile) return;
    const { data: s } = await supabase.from('settings').select('kitchen_warning_minutes, kitchen_danger_minutes').eq('company_id', profile.company_id).maybeSingle();
    if (s) setSettings(s as any);

    const { data } = await supabase
      .from('order_items')
      .select('id, product_id, product_name, quantity, unit_price, notes, kitchen_status, sent_to_kitchen_at, item_type, weight_grams, order_item_options(option_group_name, option_item_name), orders!inner(id, order_number, company_id, customer_name, origin, service_mode, tables(name))')
      .in('kitchen_status', ['aguardando', 'preparo', 'pronto'])
      .eq('sends_to_kitchen', true)
      .eq('orders.company_id', profile.company_id)
      .order('sent_to_kitchen_at', { ascending: true });

    const mapped: KitchenItem[] = (data ?? []).map((r: any) => ({
      id: r.id,
      product_id: r.product_id ?? null,
      product_name: r.product_name,
      quantity: Number(r.quantity),
      unit_price: Number(r.unit_price ?? 0),
      notes: r.notes,
      kitchen_status: r.kitchen_status,
      sent_to_kitchen_at: r.sent_to_kitchen_at,
      item_type: r.item_type ?? null,
      weight_grams: r.weight_grams != null ? Number(r.weight_grams) : null,
      options: r.order_item_options ?? [],
      order_id: r.orders?.id,
      order_number: r.orders?.order_number ?? 0,
      table_name: r.orders?.tables?.name ?? null,
      customer_name: r.orders?.customer_name ?? null,
      origin: r.orders?.origin ?? 'local',
      service_mode: r.orders?.service_mode ?? 'local',
    }));

    // Detect newly-arrived items (status "aguardando") to ring the bell.
    const nextIds = new Set(mapped.map((m) => m.id));
    if (knownIdsRef.current === null) {
      knownIdsRef.current = nextIds;
    } else {
      const prev = knownIdsRef.current;
      const hasNew = mapped.some((m) => m.kitchen_status === 'aguardando' && !prev.has(m.id));
      knownIdsRef.current = nextIds;
      if (hasNew && soundEnabledRef.current) {
        const ctx = ensureAudio();
        if (ctx) playBell(ctx);
      }
    }

    setItems(mapped);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [profile?.company_id]);

  useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel(`co:${profile.company_id}:kds`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [profile?.company_id]);

  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const tickets = useMemo(() => buildTickets(items), [items]);
  const waiting = tickets.filter((t) => t.status === 'aguardando');
  const inProgress = tickets.filter((t) => t.status === 'preparo' || t.status === 'pronto');

  const setStatus = async (ticket: Ticket, status: string) => {
    const updates: any = { kitchen_status: status };
    const now = new Date().toISOString();
    if (status === 'preparo') updates.started_preparation_at = now;
    if (status === 'pronto') updates.ready_at = now;
    if (status === 'entregue') updates.delivered_at = now;
    if (status === 'cancelado') updates.canceled_at = now;
    const { error } = await supabase.from('order_items').update(updates).in('id', ticket.itemIds);
    if (error) { toast.error('Não foi possível atualizar o pedido. Tente novamente.'); return; }
    toast.success('Atualizado');
    load();
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Painel da cozinha</p>
          <h1 className="font-display text-3xl sm:text-4xl mt-1">KDS</h1>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 cursor-pointer select-none">
            {soundEnabled ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
            <Label htmlFor="kds-sound" className="text-xs cursor-pointer">Alerta sonoro</Label>
            <Switch id="kds-sound" checked={soundEnabled} onCheckedChange={toggleSound} />
          </label>
          <div className="text-xs text-muted-foreground">
            Alerta amarelo a partir de <b>{settings.kitchen_warning_minutes} min</b>, vermelho a partir de <b>{settings.kitchen_danger_minutes} min</b>
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-2 items-start">
        <Column title="Aguardando preparo" count={waiting.length} accent="warning">
          {waiting.length === 0 ? (
            <EmptyState text="Nenhum pedido aguardando preparo." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {waiting.map((t) => (
                <TicketCard key={t.key} ticket={t} settings={settings} onStatus={setStatus} />
              ))}
            </div>
          )}
        </Column>

        <Column title="Em preparo e pronto" count={inProgress.length} accent="accent">
          {inProgress.length === 0 ? (
            <EmptyState text="Nada em produção no momento." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {inProgress.map((t) => (
                <TicketCard key={t.key} ticket={t} settings={settings} onStatus={setStatus} />
              ))}
            </div>
          )}
        </Column>
      </div>
    </div>
  );
}

function Column({ title, count, accent, children }: { title: string; count: number; accent: 'warning' | 'accent'; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-display text-xl">{title}</h2>
        <span className={cn(
          'rounded-full px-2 py-0.5 text-xs font-mono tabular-nums',
          accent === 'warning' ? 'bg-warning/20 text-warning-foreground' : 'bg-accent/20 text-accent-foreground',
        )}>
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function OriginLabel({ ticket }: { ticket: Ticket }) {
  if (ticket.origin === 'digital_menu') {
    const delivery = ticket.service_mode === 'delivery';
    return (
      <span className="inline-flex items-center gap-1">
        {delivery ? <Bike className="h-3.5 w-3.5" /> : <ShoppingBag className="h-3.5 w-3.5" />}
        {delivery ? 'Delivery' : 'Retirada'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Utensils className="h-3.5 w-3.5" />
      {ticket.table_name ?? 'Balcão'}
    </span>
  );
}

function TicketCard({ ticket, settings, onStatus }: {
  ticket: Ticket; settings: Settings; onStatus: (t: Ticket, s: string) => Promise<void>;
}) {
  const mins = minutesSince(ticket.since);
  const ready = ticket.status === 'pronto';
  const danger = !ready && mins >= settings.kitchen_danger_minutes;
  const warn = !ready && !danger && mins >= settings.kitchen_warning_minutes;

  return (
    <div className={cn(
      'rounded-xl border bg-card p-4 transition shadow-card min-w-0',
      ready && 'border-success/60 bg-success/5',
      danger && 'border-destructive/60 bg-destructive/5',
      warn && 'border-warning/60 bg-warning/10',
      !ready && !warn && !danger && 'border-border',
      ticket.status === 'preparo' && !warn && !danger && 'border-accent/50',
    )}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-display text-lg">#{String(ticket.order_number).padStart(4, '0')}</div>
        <span className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-mono tabular-nums shrink-0',
          danger ? 'bg-destructive text-destructive-foreground'
            : warn ? 'bg-warning text-warning-foreground'
            : ready ? 'bg-success text-success-foreground'
            : 'bg-muted text-muted-foreground',
        )}>
          <Clock className="h-3 w-3" /> {mins}min
        </span>
      </div>

      <div className="mt-1 text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <OriginLabel ticket={ticket} />
        {ticket.customer_name && <span className="break-words">· {ticket.customer_name}</span>}
        <span>· {fmtTime(ticket.since)}</span>
      </div>

      <span className={cn(
        'mt-2 inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider',
        ticket.status === 'aguardando' && 'bg-muted text-muted-foreground',
        ticket.status === 'preparo' && 'bg-accent/20 text-accent-foreground',
        ready && 'bg-success text-success-foreground',
      )}>
        {ticket.status === 'aguardando' ? 'Aguardando preparo' : ticket.status === 'preparo' ? 'Em preparo' : 'Pronto'}
      </span>

      <ul className="mt-3 space-y-2">
        {ticket.lines.map((l) => (
          <li key={l.key} className="min-w-0">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="font-mono text-base font-semibold shrink-0">{l.quantity}×</span>
              <span className="text-sm font-medium leading-tight break-words min-w-0">{l.name}</span>
            </div>
            {l.options.length > 0 && (
              <ul className="mt-0.5 text-[11px] text-muted-foreground space-y-0.5">
                {l.options.map((o, i) => <li key={i}>• {o.option_group_name}: {o.option_item_name}</li>)}
              </ul>
            )}
            {l.notes && (
              <div className="mt-1 rounded-md bg-warning/15 px-2 py-1 text-[11px] italic text-warning-foreground break-words">"{l.notes}"</div>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        {ticket.status === 'aguardando' && (
          <BusyButton size="sm" busyText="Iniciando…" onClick={() => onStatus(ticket, 'preparo')} className="bg-primary">
            <Play className="h-3.5 w-3.5 mr-1" /> Iniciar preparo
          </BusyButton>
        )}
        {ticket.status === 'preparo' && (
          <BusyButton size="sm" busyText="Salvando…" onClick={() => onStatus(ticket, 'pronto')} className="bg-success text-success-foreground hover:bg-success/90">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Marcar como pronto
          </BusyButton>
        )}
        {ready && (
          <BusyButton size="sm" busyText="Salvando…" onClick={() => onStatus(ticket, 'entregue')} variant="outline">
            <Truck className="h-3.5 w-3.5 mr-1" /> Retirar da cozinha
          </BusyButton>
        )}
      </div>
    </div>
  );
}

export default CozinhaPage;
