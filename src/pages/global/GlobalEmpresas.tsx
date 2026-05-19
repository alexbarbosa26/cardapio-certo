import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pause, Play } from 'lucide-react';
import {
  adminCreateCompany, adminSetSubscription, adminSuspendCompany, adminReactivateCompany,
} from '@/lib/admin-companies';

interface Row {
  id: string;
  name: string;
  trade_name: string | null;
  status: string;
  responsible_email: string | null;
  created_at: string;
  subscription_status?: string;
  plan_name?: string;
}

interface Plan { id: string; name: string }

export default function GlobalEmpresas() {
  const [rows, setRows] = useState<Row[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from('companies')
      .select('id, name, trade_name, status, responsible_email, created_at, subscriptions(status, plans(name))')
      .order('created_at', { ascending: false });
    setRows((data ?? []).map((c) => {
      const sub = (c as { subscriptions?: Array<{ status: string; plans?: { name: string } }> }).subscriptions?.[0];
      return {
        id: c.id, name: c.name, trade_name: c.trade_name, status: c.status,
        responsible_email: c.responsible_email, created_at: c.created_at,
        subscription_status: sub?.status, plan_name: sub?.plans?.name,
      };
    }));
    const { data: pl } = await supabase.from('plans').select('id, name').eq('status', 'ativo').order('name');
    setPlans(pl ?? []);
  };

  useEffect(() => { void load(); }, []);

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
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Empresas</h1>
          <p className="text-sm text-muted-foreground">Gerencie restaurantes assinantes da plataforma.</p>
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
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="font-medium">{r.name}</div>
                  {r.trade_name && <div className="text-xs text-muted-foreground">{r.trade_name}</div>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.responsible_email ?? '—'}</td>
                <td className="px-4 py-3">{r.plan_name ?? '—'}</td>
                <td className="px-4 py-3"><SubBadge status={r.subscription_status} /></td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(r.created_at).toLocaleDateString('pt-BR')}</td>
                <td className="px-4 py-3 text-right">
                  {r.subscription_status === 'suspended' ? (
                    <Button size="sm" variant="outline" onClick={() => onReactivate(r.id)}>
                      <Play className="h-3 w-3 mr-1" />Reativar
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => onSuspend(r.id)}>
                      <Pause className="h-3 w-3 mr-1" />Suspender
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhuma empresa cadastrada.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function SubBadge({ status }: { status?: string }) {
  if (!status) return <Badge variant="outline">sem assinatura</Badge>;
  const map: Record<string, string> = {
    active: 'bg-green-500/15 text-green-700',
    trialing: 'bg-blue-500/15 text-blue-700',
    suspended: 'bg-orange-500/15 text-orange-700',
    canceled: 'bg-red-500/15 text-red-700',
    past_due: 'bg-yellow-500/15 text-yellow-700',
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
