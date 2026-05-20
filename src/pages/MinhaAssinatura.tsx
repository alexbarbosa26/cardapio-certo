import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useTenantBranding } from '@/hooks/use-tenant-branding';
import { billing } from '@/lib/payments';
import { toast } from 'sonner';
import { MessageCircle, Mail, ExternalLink, ArrowRightLeft, XCircle, RefreshCw } from 'lucide-react';

interface PlanFull {
  name: string;
  description: string | null;
  monthly_price: number;
  annual_price: number;
  max_users: number | null;
  max_tables: number | null;
  max_open_tabs: number | null;
  allow_tables_module: boolean;
  allow_tabs_module: boolean;
  allow_kitchen_module: boolean;
  allow_advanced_dashboard: boolean;
}

interface Usage { users: number; tables: number; openTabs: number; }

const SUPPORT_WHATSAPP = '5511999999999';
const SUPPORT_EMAIL = 'suporte@mesachef.com.br';

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

function statusLabel(s: string) {
  return ({
    active: 'Ativa', trialing: 'Em teste', past_due: 'Pagamento pendente',
    suspended: 'Suspensa', canceled: 'Cancelada', expired: 'Expirada',
  } as Record<string, string>)[s] ?? s;
}

function UsageRow({ label, used, max }: { label: string; used: number; max: number | null }) {
  const pct = max == null ? 0 : Math.min(100, Math.round((used / Math.max(max, 1)) * 100));
  const over = max != null && used >= max;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={over ? 'text-destructive font-semibold' : 'text-muted-foreground'}>
          {used} / {max ?? 'ilimitado'}
        </span>
      </div>
      {max != null && <Progress value={pct} className={over ? '[&>div]:bg-destructive' : ''} />}
    </div>
  );
}

interface AvailablePlan {
  id: string; name: string; slug: string; short_description: string | null;
  monthly_price: number; annual_price: number;
  max_users: number | null; max_tables: number | null; max_open_tabs: number | null;
}
interface PaymentRow { id: string; amount: number; status: string; paid_at: string | null; created_at: string; payment_method: string | null; }
interface EventRow { id: string; event_type: string; description: string | null; created_at: string; }

export default function MinhaAssinatura() {
  const { profile, subscription, refresh } = useAuth();
  const branding = useTenantBranding();
  const [plan, setPlan] = useState<PlanFull | null>(null);
  const [usage, setUsage] = useState<Usage>({ users: 0, tables: 0, openTabs: 0 });
  const [available, setAvailable] = useState<AvailablePlan[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    if (!subscription?.plan_id || !profile?.company_id) return;
    const [{ data: p }, users, tables, openTabs, { data: plans }, { data: pays }, { data: evs }] = await Promise.all([
      supabase.from('plans').select('*').eq('id', subscription.plan_id).maybeSingle(),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', profile.company_id),
      supabase.from('tables').select('id', { count: 'exact', head: true }).eq('company_id', profile.company_id),
      supabase.from('customer_tabs').select('id', { count: 'exact', head: true }).eq('company_id', profile.company_id).eq('status', 'aberta'),
      supabase.from('plans').select('id,name,slug,short_description,monthly_price,annual_price,max_users,max_tables,max_open_tabs').eq('status', 'ativo').order('display_order'),
      supabase.from('subscription_payments').select('id,amount,status,paid_at,created_at,payment_method').eq('company_id', profile.company_id).order('created_at', { ascending: false }).limit(20),
      supabase.from('subscription_events').select('id,event_type,description,created_at').eq('company_id', profile.company_id).order('created_at', { ascending: false }).limit(20),
    ]);
    setPlan(p as PlanFull | null);
    setUsage({ users: users.count ?? 0, tables: tables.count ?? 0, openTabs: openTabs.count ?? 0 });
    setAvailable((plans ?? []) as AvailablePlan[]);
    setPayments((pays ?? []) as PaymentRow[]);
    setEvents((evs ?? []) as EventRow[]);
  };

  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [subscription?.plan_id, profile?.company_id]);

  const changePlan = async (newPlanId: string) => {
    if (newPlanId === subscription?.plan_id) return;
    setBusy(true);
    try { await billing.changePlan(newPlanId); toast.success('Plano alterado com sucesso.'); await refresh(); await reload(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const doCancel = async () => {
    setBusy(true);
    try { await billing.cancelSubscription({ reason: cancelReason, cancel_at_period_end: true });
      toast.success('Cancelamento agendado para o fim do período.');
      setCancelOpen(false); setCancelReason(''); await refresh(); await reload();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const doReactivate = async () => {
    setBusy(true);
    try { await billing.reactivateSubscription(); toast.success('Assinatura reativada.'); await refresh(); await reload(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const waMsg = encodeURIComponent(`Olá, sou ${profile?.name} da empresa ${branding.displayName ?? profile?.company_name}. Preciso de suporte com minha assinatura MesaChef.`);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl">
      <header>
        <h1 className="font-display text-3xl">Minha assinatura</h1>
        <p className="text-sm text-muted-foreground">Acompanhe seu plano, uso e status de pagamento.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2 space-y-3">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Plano atual</div>
              <h2 className="font-display text-2xl">{plan?.name ?? subscription?.plan_name ?? '—'}</h2>
              {plan?.description && <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>}
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Status</div>
              <div className="font-semibold">{subscription ? statusLabel(subscription.status) : '—'}</div>
            </div>
          </div>
          {plan && (
            <div className="font-display text-2xl pt-2">
              R$ {Number(plan.monthly_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              <span className="text-sm text-muted-foreground"> /mês</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 pt-2 text-sm border-t border-border">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Período atual até</div>
              <div className="font-medium">{fmtDate(subscription?.current_period_end ?? null)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Fim do trial</div>
              <div className="font-medium">{fmtDate(subscription?.trial_ends_at ?? null)}</div>
            </div>
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <h3 className="font-display text-lg">Precisa de ajuda?</h3>
          <p className="text-sm text-muted-foreground">Fale com nosso time para mudar de plano, renovar ou tirar dúvidas.</p>
          <div className="space-y-2">
            <Button asChild className="w-full" variant="default">
              <a href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${waMsg}`} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            </Button>
            <Button asChild className="w-full" variant="outline">
              <a href={`mailto:${SUPPORT_EMAIL}`}>
                <Mail className="h-4 w-4" /> {SUPPORT_EMAIL}
              </a>
            </Button>
          </div>
        </Card>
      </div>

      <Card className="p-5 space-y-4">
        <h3 className="font-display text-lg">Uso vs. limites do plano</h3>
        <UsageRow label="Usuários" used={usage.users} max={plan?.max_users ?? null} />
        <UsageRow label="Mesas" used={usage.tables} max={plan?.max_tables ?? null} />
        <UsageRow label="Comandas abertas" used={usage.openTabs} max={plan?.max_open_tabs ?? null} />
      </Card>

      {plan && (
        <Card className="p-5 space-y-2">
          <h3 className="font-display text-lg">Módulos liberados</h3>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>Módulo de mesas: {plan.allow_tables_module ? '✓' : '—'}</li>
            <li>Módulo de comandas: {plan.allow_tabs_module ? '✓' : '—'}</li>
            <li>Painel da cozinha: {plan.allow_kitchen_module ? '✓' : '—'}</li>
            <li>Dashboard avançado: {plan.allow_advanced_dashboard ? '✓' : '—'}</li>
          </ul>
        </Card>
      )}


      {/* Alterar plano */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-lg flex items-center gap-2"><ArrowRightLeft className="h-4 w-4" /> Alterar plano</h3>
          {subscription?.cancel_at_period_end || subscription?.status === 'canceled' ? (
            <Button size="sm" variant="outline" onClick={doReactivate} disabled={busy}>
              <RefreshCw className="h-4 w-4" /> Reativar assinatura
            </Button>
          ) : (
            <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="text-destructive border-destructive/40 hover:bg-destructive/10">
                  <XCircle className="h-4 w-4" /> Cancelar assinatura
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Cancelar assinatura</DialogTitle></DialogHeader>
                <p className="text-sm text-muted-foreground">
                  Você manterá acesso até o fim do período atual. Após isso, os módulos operacionais serão bloqueados.
                </p>
                <Textarea placeholder="Motivo do cancelamento (opcional)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setCancelOpen(false)}>Voltar</Button>
                  <Button variant="destructive" onClick={doCancel} disabled={busy}>Confirmar cancelamento</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {available.map((ap) => {
            const isCurrent = ap.id === subscription?.plan_id;
            return (
              <div key={ap.id} className={`rounded-lg border p-4 ${isCurrent ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <div className="flex items-baseline justify-between">
                  <div className="font-semibold">{ap.name}</div>
                  {isCurrent && <Badge variant="outline" className="text-xs">Atual</Badge>}
                </div>
                {ap.short_description && <p className="text-xs text-muted-foreground mt-1">{ap.short_description}</p>}
                <div className="mt-2 font-display text-lg">R$ {Number(ap.monthly_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}<span className="text-xs text-muted-foreground"> /mês</span></div>
                <ul className="mt-2 text-xs text-muted-foreground space-y-0.5">
                  <li>Usuários: {ap.max_users ?? 'ilimitado'}</li>
                  <li>Mesas: {ap.max_tables ?? 'ilimitado'}</li>
                  <li>Comandas: {ap.max_open_tabs ?? 'ilimitado'}</li>
                </ul>
                <Button size="sm" className="w-full mt-3" variant={isCurrent ? 'outline' : 'default'} disabled={isCurrent || busy} onClick={() => changePlan(ap.id)}>
                  {isCurrent ? 'Plano atual' : 'Mudar para este plano'}
                </Button>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Histórico */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 space-y-2">
          <h3 className="font-display text-lg">Histórico de pagamentos</h3>
          {payments.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p> : (
            <ul className="text-sm divide-y divide-border">
              {payments.map((p) => (
                <li key={p.id} className="py-2 flex items-center justify-between">
                  <div>
                    <div className="font-medium">R$ {Number(p.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    <div className="text-xs text-muted-foreground">{new Date(p.paid_at ?? p.created_at).toLocaleString('pt-BR')} · {p.payment_method ?? '—'}</div>
                  </div>
                  <Badge variant="outline" className="text-xs uppercase">{p.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5 space-y-2">
          <h3 className="font-display text-lg">Eventos da assinatura</h3>
          {events.length === 0 ? <p className="text-sm text-muted-foreground">Sem eventos.</p> : (
            <ul className="text-sm divide-y divide-border">
              {events.map((ev) => (
                <li key={ev.id} className="py-2">
                  <div className="font-medium">{ev.event_type}</div>
                  {ev.description && <div className="text-xs text-muted-foreground">{ev.description}</div>}
                  <div className="text-xs text-muted-foreground">{new Date(ev.created_at).toLocaleString('pt-BR')}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-5 text-sm space-y-2 bg-muted/30">
        <div className="flex items-center gap-2 font-medium"><ExternalLink className="h-4 w-4" /> Dados técnicos (para suporte)</div>
        <div className="text-muted-foreground">Empresa: <code>{profile?.company_id}</code></div>
        <div className="text-muted-foreground">Assinatura: <code>{subscription?.id ?? '—'}</code></div>
      </Card>
    </div>
  );
}
