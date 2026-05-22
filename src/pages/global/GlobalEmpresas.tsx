import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pause, Play, Pencil, Search, Building2, CheckCircle2, Clock, AlertTriangle, Ban } from 'lucide-react';
import { toast } from 'sonner';
import {
  adminCreateCompany, adminUpdateCompany, adminSetSubscription,
  adminSuspendCompany, adminReactivateCompany,
} from '@/lib/admin-companies';

interface Row {
  id: string;
  name: string;
  trade_name: string | null;
  document: string | null;
  responsible_name: string | null;
  responsible_email: string | null;
  responsible_phone: string | null;
  city: string | null;
  state: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  status: string;
  internal_notes: string | null;
  created_at: string;
  subscription_status?: string;
  subscription_id?: string;
  plan_id?: string;
  plan_name?: string;
  current_period_end?: string | null;
  trial_ends_at?: string | null;
  billing_cycle?: string;
}

interface Plan { id: string; name: string }

export default function GlobalEmpresas() {
  const [rows, setRows] = useState<Row[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPlan, setFilterPlan] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from('companies')
      .select('*, subscriptions(id, status, plan_id, current_period_end, trial_ends_at, billing_cycle, plans(name))')
      .order('created_at', { ascending: false });
    setRows((data ?? []).map((c) => {
      const sub = (c as { subscriptions?: Array<{ id: string; status: string; plan_id: string; current_period_end: string | null; trial_ends_at: string | null; billing_cycle: string; plans?: { name: string } }> }).subscriptions?.[0];
      return {
        ...(c as Row),
        subscription_status: sub?.status,
        subscription_id: sub?.id,
        plan_id: sub?.plan_id,
        plan_name: sub?.plans?.name,
        current_period_end: sub?.current_period_end ?? null,
        trial_ends_at: sub?.trial_ends_at ?? null,
        billing_cycle: sub?.billing_cycle,
      };
    }));
    const { data: pl } = await supabase.from('plans').select('id, name').eq('status', 'ativo').order('display_order');
    setPlans(pl ?? []);
  };

  useEffect(() => { void load(); }, []);

  const stats = useMemo(() => {
    const t = rows.length;
    const ativas = rows.filter((r) => r.subscription_status === 'active').length;
    const trial = rows.filter((r) => r.subscription_status === 'trialing').length;
    const susp = rows.filter((r) => r.subscription_status === 'suspended').length;
    const inad = rows.filter((r) => r.subscription_status === 'past_due').length;
    return { t, ativas, trial, susp, inad };
  }, [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (search) {
      const s = search.toLowerCase();
      const hit = [r.name, r.trade_name, r.document, r.responsible_name, r.responsible_email, r.responsible_phone]
        .some((v) => v?.toLowerCase().includes(s));
      if (!hit) return false;
    }
    if (filterStatus !== 'all' && r.subscription_status !== filterStatus) return false;
    if (filterPlan !== 'all' && r.plan_id !== filterPlan) return false;
    return true;
  }), [rows, search, filterStatus, filterPlan]);

  const onSuspend = async (id: string) => {
    try { await adminSuspendCompany(id); toast.success('Empresa suspensa'); await load(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const onReactivate = async (id: string) => {
    try { await adminReactivateCompany(id); toast.success('Empresa reativada'); await load(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="p-8 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Clientes</h1>
          <p className="text-sm text-muted-foreground">Empresas assinantes da plataforma MesaChef.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Nova empresa</Button></DialogTrigger>
          <CreateCompanyDialog
            plans={plans}
            loading={loading}
            onCreate={async (input) => {
              setLoading(true);
              try {
                await adminCreateCompany(input);
                toast.success('Empresa criada com sucesso');
                setOpen(false);
                await load();
              } catch (e) { toast.error((e as Error).message); }
              finally { setLoading(false); }
            }}
          />
        </Dialog>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat icon={Building2} label="Total" value={stats.t} />
        <Stat icon={CheckCircle2} label="Ativas" value={stats.ativas} tone="green" />
        <Stat icon={Clock} label="Em trial" value={stats.trial} tone="blue" />
        <Stat icon={AlertTriangle} label="Inadimplentes" value={stats.inad} tone="yellow" />
        <Stat icon={Ban} label="Suspensas" value={stats.susp} tone="red" />
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar nome, documento, e-mail ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="trialing">Em trial</SelectItem>
            <SelectItem value="active">Ativa</SelectItem>
            <SelectItem value="past_due">Inadimplente</SelectItem>
            <SelectItem value="suspended">Suspensa</SelectItem>
            <SelectItem value="canceled">Cancelada</SelectItem>
            <SelectItem value="expired">Expirada</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPlan} onValueChange={setFilterPlan}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os planos</SelectItem>
            {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Responsável</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Assinatura</th>
              <th className="px-4 py-3">Criada</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="font-medium">{r.name}</div>
                  {r.trade_name && <div className="text-xs text-muted-foreground">{r.trade_name}</div>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <div>{r.responsible_name ?? '—'}</div>
                  <div className="text-xs">{r.responsible_email ?? '—'}</div>
                </td>
                <td className="px-4 py-3">{r.plan_name ?? '—'}</td>
                <td className="px-4 py-3"><SubBadge status={r.subscription_status} /></td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(r.created_at).toLocaleDateString('pt-BR')}</td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                    {r.subscription_status === 'suspended' ? (
                      <Button size="sm" variant="outline" onClick={() => onReactivate(r.id)}>
                        <Play className="h-3 w-3 mr-1" />Reativar
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => onSuspend(r.id)}>
                        <Pause className="h-3 w-3 mr-1" />Suspender
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Nenhuma empresa encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <EditCompanyDialog
            row={editing} plans={plans}
            onClose={() => setEditing(null)}
            onSaved={async () => { setEditing(null); await load(); }}
          />
        )}
      </Dialog>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; tone?: 'green' | 'blue' | 'yellow' | 'red' }) {
  const toneCls =
    tone === 'green' ? 'text-green-600 bg-green-500/10' :
    tone === 'blue' ? 'text-blue-600 bg-blue-500/10' :
    tone === 'yellow' ? 'text-yellow-700 bg-yellow-500/10' :
    tone === 'red' ? 'text-red-600 bg-red-500/10' :
    'text-foreground bg-muted';
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={`h-10 w-10 rounded-md grid place-items-center ${toneCls}`}><Icon className="h-5 w-5" /></div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-display text-2xl">{value}</div>
      </div>
    </Card>
  );
}

function SubBadge({ status }: { status?: string }) {
  if (!status) return <Badge variant="outline">sem assinatura</Badge>;
  const map: Record<string, string> = {
    active: 'bg-green-500/15 text-green-700',
    trialing: 'bg-blue-500/15 text-blue-700',
    suspended: 'bg-orange-500/15 text-orange-700',
    canceled: 'bg-red-500/15 text-red-700',
    past_due: 'bg-yellow-500/15 text-yellow-800',
    expired: 'bg-gray-500/15 text-gray-700',
  };
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? ''}`}>{status}</span>;
}

function CreateCompanyDialog({
  plans, loading, onCreate,
}: {
  plans: Plan[]; loading: boolean;
  onCreate: (i: Parameters<typeof adminCreateCompany>[0]) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: '', trade_name: '', responsible_name: '', responsible_email: '',
    responsible_phone: '', city: '', state: '', plan_id: '',
    admin_name: '', admin_email: '', admin_password: '',
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Nova empresa</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome*"><Input value={form.name} onChange={set('name')} /></Field>
        <Field label="Nome fantasia"><Input value={form.trade_name} onChange={set('trade_name')} /></Field>
        <Field label="Responsável"><Input value={form.responsible_name} onChange={set('responsible_name')} /></Field>
        <Field label="E-mail responsável"><Input value={form.responsible_email} onChange={set('responsible_email')} /></Field>
        <Field label="Telefone"><Input value={form.responsible_phone} onChange={set('responsible_phone')} /></Field>
        <Field label="Cidade"><Input value={form.city} onChange={set('city')} /></Field>
        <Field label="Estado"><Input value={form.state} onChange={set('state')} maxLength={2} /></Field>
        <Field label="Plano">
          <Select value={form.plan_id} onValueChange={(v) => setForm({ ...form, plan_id: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="mt-4 rounded-md border border-border p-4 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Usuário admin da empresa</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome*"><Input value={form.admin_name} onChange={set('admin_name')} /></Field>
          <Field label="E-mail*"><Input value={form.admin_email} onChange={set('admin_email')} /></Field>
          <Field label="Senha temporária*"><Input value={form.admin_password} onChange={set('admin_password')} type="password" /></Field>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => onCreate(form)} disabled={loading || !form.name || !form.admin_name || !form.admin_email || !form.admin_password}>
          {loading ? 'Criando…' : 'Criar empresa'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

interface AuditRow {
  id: string; created_at: string; action: string;
  new_value: Record<string, unknown> | null;
  old_value: Record<string, unknown> | null;
}

function EditCompanyDialog({
  row, plans, onClose, onSaved,
}: {
  row: Row; plans: Plan[];
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: row.name, trade_name: row.trade_name ?? '', document: row.document ?? '',
    responsible_name: row.responsible_name ?? '', responsible_email: row.responsible_email ?? '',
    responsible_phone: row.responsible_phone ?? '', city: row.city ?? '', state: row.state ?? '',
    status: row.status,
    logo_url: row.logo_url ?? '', primary_color: row.primary_color ?? '',
    secondary_color: row.secondary_color ?? '', accent_color: row.accent_color ?? '',
    internal_notes: row.internal_notes ?? '',
    display_name: '', receipt_message: '',
  });
  const [subForm, setSubForm] = useState({
    plan_id: row.plan_id ?? '',
    status: row.subscription_status ?? 'active',
    billing_cycle: row.billing_cycle ?? 'monthly',
    current_period_end: row.current_period_end ? row.current_period_end.slice(0, 10) : '',
    trial_ends_at: row.trial_ends_at ? row.trial_ends_at.slice(0, 10) : '',
  });
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [usage, setUsage] = useState<{ users: number; tables: number; tabs: number }>({ users: 0, tables: 0, tabs: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from('settings').select('display_name, receipt_message').eq('company_id', row.id).maybeSingle();
      if (s) setForm((f) => ({ ...f, display_name: s.display_name ?? '', receipt_message: s.receipt_message ?? '' }));
      const { data: a } = await supabase.from('audit_logs').select('id, created_at, action, new_value, old_value')
        .eq('company_id', row.id).order('created_at', { ascending: false }).limit(50);
      setAudit((a ?? []) as AuditRow[]);
      const [u, t, tabs] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', row.id),
        supabase.from('tables').select('id', { count: 'exact', head: true }).eq('company_id', row.id),
        supabase.from('customer_tabs').select('id', { count: 'exact', head: true }).eq('company_id', row.id).eq('status', 'aberta'),
      ]);
      setUsage({ users: u.count ?? 0, tables: t.count ?? 0, tabs: tabs.count ?? 0 });
    })();
  }, [row.id]);

  const setF = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const saveDados = async () => {
    setSaving(true);
    try {
      await adminUpdateCompany({
        company_id: row.id,
        name: form.name, trade_name: form.trade_name, document: form.document,
        responsible_name: form.responsible_name, responsible_email: form.responsible_email,
        responsible_phone: form.responsible_phone, city: form.city, state: form.state,
        status: form.status,
        logo_url: form.logo_url, primary_color: form.primary_color,
        secondary_color: form.secondary_color, accent_color: form.accent_color,
        internal_notes: form.internal_notes,
        settings: { display_name: form.display_name, receipt_message: form.receipt_message },
      });
      toast.success('Cadastro atualizado');
      await onSaved();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const saveSub = async () => {
    setSaving(true);
    try {
      await adminSetSubscription({
        company_id: row.id,
        plan_id: subForm.plan_id || undefined,
        status: subForm.status as 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled' | 'expired',
        billing_cycle: subForm.billing_cycle as 'monthly' | 'annual',
        current_period_end: subForm.current_period_end ? new Date(subForm.current_period_end).toISOString() : undefined,
        trial_ends_at: subForm.trial_ends_at ? new Date(subForm.trial_ends_at).toISOString() : undefined,
      });
      toast.success('Assinatura atualizada');
      await onSaved();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3">
          {row.name}
          <SubBadge status={row.subscription_status} />
        </DialogTitle>
      </DialogHeader>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Mini label="Usuários" value={usage.users} />
        <Mini label="Mesas" value={usage.tables} />
        <Mini label="Comandas abertas" value={usage.tabs} />
      </div>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados gerais</TabsTrigger>
          <TabsTrigger value="plano">Plano e assinatura</TabsTrigger>
          <TabsTrigger value="personal">Personalização</TabsTrigger>
          <TabsTrigger value="obs">Observações</TabsTrigger>
          <TabsTrigger value="audit">Auditoria</TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="space-y-3 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome"><Input value={form.name} onChange={setF('name')} /></Field>
            <Field label="Nome fantasia"><Input value={form.trade_name} onChange={setF('trade_name')} /></Field>
            <Field label="CNPJ/CPF"><Input value={form.document} onChange={setF('document')} /></Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativa</SelectItem>
                  <SelectItem value="suspensa">Suspensa</SelectItem>
                  <SelectItem value="bloqueada">Bloqueada</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Responsável"><Input value={form.responsible_name} onChange={setF('responsible_name')} /></Field>
            <Field label="E-mail responsável"><Input value={form.responsible_email} onChange={setF('responsible_email')} /></Field>
            <Field label="Telefone/WhatsApp"><Input value={form.responsible_phone} onChange={setF('responsible_phone')} /></Field>
            <Field label="Cidade"><Input value={form.city} onChange={setF('city')} /></Field>
            <Field label="Estado"><Input value={form.state} onChange={setF('state')} maxLength={2} /></Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
            <Button onClick={saveDados} disabled={saving}>{saving ? 'Salvando…' : 'Salvar dados'}</Button>
          </DialogFooter>
        </TabsContent>

        <TabsContent value="plano" className="space-y-3 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Plano">
              <Select value={subForm.plan_id} onValueChange={(v) => setSubForm({ ...subForm, plan_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status da assinatura">
              <Select value={subForm.status} onValueChange={(v) => setSubForm({ ...subForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trialing">Em trial</SelectItem>
                  <SelectItem value="active">Ativa</SelectItem>
                  <SelectItem value="past_due">Inadimplente</SelectItem>
                  <SelectItem value="suspended">Suspensa</SelectItem>
                  <SelectItem value="canceled">Cancelada</SelectItem>
                  <SelectItem value="expired">Expirada</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Ciclo de cobrança">
              <Select value={subForm.billing_cycle} onValueChange={(v) => setSubForm({ ...subForm, billing_cycle: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="annual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Fim do trial">
              <Input type="date" value={subForm.trial_ends_at}
                onChange={(e) => setSubForm({ ...subForm, trial_ends_at: e.target.value })} />
            </Field>
            <Field label="Próximo vencimento">
              <Input type="date" value={subForm.current_period_end}
                onChange={(e) => setSubForm({ ...subForm, current_period_end: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
            <Button onClick={saveSub} disabled={saving}>{saving ? 'Salvando…' : 'Salvar assinatura'}</Button>
          </DialogFooter>
        </TabsContent>

        <TabsContent value="personal" className="space-y-3 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome exibido no sistema"><Input value={form.display_name} onChange={setF('display_name')} /></Field>
            <Field label="URL do logo"><Input value={form.logo_url} onChange={setF('logo_url')} /></Field>
            <Field label="Cor primária"><Input value={form.primary_color} onChange={setF('primary_color')} placeholder="#000000" /></Field>
            <Field label="Cor secundária"><Input value={form.secondary_color} onChange={setF('secondary_color')} placeholder="#000000" /></Field>
            <Field label="Cor de destaque"><Input value={form.accent_color} onChange={setF('accent_color')} placeholder="#000000" /></Field>
          </div>
          <Field label="Mensagem no comprovante">
            <Textarea rows={3} value={form.receipt_message} onChange={setF('receipt_message')} />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
            <Button onClick={saveDados} disabled={saving}>{saving ? 'Salvando…' : 'Salvar personalização'}</Button>
          </DialogFooter>
        </TabsContent>

        <TabsContent value="obs" className="space-y-3 pt-4">
          <Field label="Observações internas (apenas Super Admin)">
            <Textarea rows={8} value={form.internal_notes} onChange={setF('internal_notes')} placeholder="Notas, histórico de contatos, contexto comercial..." />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
            <Button onClick={saveDados} disabled={saving}>{saving ? 'Salvando…' : 'Salvar observações'}</Button>
          </DialogFooter>
        </TabsContent>

        <TabsContent value="audit" className="pt-4">
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {audit.length === 0 && <p className="text-sm text-muted-foreground">Nenhum registro de auditoria para esta empresa.</p>}
            {audit.map((a) => (
              <Card key={a.id} className="p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{a.action}</span>
                  <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString('pt-BR')}</span>
                </div>
                {a.new_value && (
                  <pre className="text-[11px] mt-2 text-muted-foreground whitespace-pre-wrap">{JSON.stringify(a.new_value, null, 2)}</pre>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-display text-xl">{value}</div>
    </Card>
  );
}
