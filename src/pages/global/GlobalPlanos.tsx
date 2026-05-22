import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Power, Trash2, Star, Eye, EyeOff, Search } from 'lucide-react';
import { toast } from 'sonner';
import { adminCreatePlan, adminUpdatePlan, adminSetPlanStatus, adminDeletePlan, type PlanInput } from '@/lib/admin-plans';

interface Plan {
  id: string;
  name: string;
  slug: string | null;
  short_description: string | null;
  full_description: string | null;
  description: string | null;
  monthly_price: number;
  annual_price: number;
  trial_days: number;
  max_users: number | null;
  max_tables: number | null;
  max_open_tabs: number | null;
  max_products: number | null;
  allow_tables_module: boolean;
  allow_tabs_module: boolean;
  allow_kitchen_module: boolean;
  allow_cash_register_module: boolean;
  allow_advanced_dashboard: boolean;
  allow_reports: boolean;
  allow_visual_customization: boolean;
  support_level: string;
  is_featured: boolean;
  show_on_landing_page: boolean;
  display_order: number;
  status: string;
}

const EMPTY: PlanInput = {
  name: '', slug: '', short_description: '', full_description: '',
  monthly_price: 0, annual_price: 0, trial_days: 7,
  max_users: 3, max_tables: 10, max_open_tabs: 20, max_products: null,
  allow_tables_module: true, allow_tabs_module: true,
  allow_kitchen_module: true, allow_cash_register_module: true,
  allow_advanced_dashboard: false, allow_reports: true,
  allow_visual_customization: false, support_level: 'padrao',
  is_featured: false, show_on_landing_page: true, display_order: 0, status: 'ativo',
};

export default function GlobalPlanos() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'ativo' | 'inativo'>('all');
  const [filterLanding, setFilterLanding] = useState<'all' | 'yes' | 'no'>('all');
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Plan | null>(null);

  const load = async () => {
    const { data } = await supabase.from('plans').select('*').order('display_order').order('monthly_price');
    setPlans((data ?? []) as Plan[]);
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    return plans.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterStatus !== 'all' && p.status !== filterStatus) return false;
      if (filterLanding === 'yes' && !p.show_on_landing_page) return false;
      if (filterLanding === 'no' && p.show_on_landing_page) return false;
      return true;
    });
  }, [plans, search, filterStatus, filterLanding]);

  const onToggleStatus = async (p: Plan) => {
    try {
      await adminSetPlanStatus(p.id, p.status === 'ativo' ? 'inativo' : 'ativo');
      toast.success(`Plano ${p.status === 'ativo' ? 'desativado' : 'ativado'}`);
      await load();
    } catch (e) { toast.error((e as Error).message); }
  };

  const onDelete = async (p: Plan) => {
    try {
      await adminDeletePlan(p.id);
      toast.success('Plano excluído');
      setConfirmDelete(null);
      await load();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="p-8 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Planos</h1>
          <p className="text-sm text-muted-foreground">Catálogo comercial do MesaChef.</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />Novo plano</Button>
      </header>

      <Card className="p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="ativo">Ativos</SelectItem>
            <SelectItem value="inativo">Inativos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterLanding} onValueChange={(v) => setFilterLanding(v as typeof filterLanding)}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda visibilidade</SelectItem>
            <SelectItem value="yes">Na Landing</SelectItem>
            <SelectItem value="no">Ocultos da Landing</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Preço</th>
              <th className="px-4 py-3">Limites</th>
              <th className="px-4 py-3">Visibilidade</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 font-medium">
                    {p.name}
                    {p.is_featured && <Badge className="bg-accent text-accent-foreground gap-1"><Star className="h-3 w-3" />Destaque</Badge>}
                  </div>
                  {p.short_description && <div className="text-xs text-muted-foreground">{p.short_description}</div>}
                  {p.slug && <div className="text-[11px] font-mono text-muted-foreground/70">/{p.slug}</div>}
                </td>
                <td className="px-4 py-3">
                  <div>R$ {Number(p.monthly_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}<span className="text-xs text-muted-foreground">/mês</span></div>
                  {Number(p.annual_price) > 0 && (
                    <div className="text-xs text-muted-foreground">R$ {Number(p.annual_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/ano</div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  Usuários: {p.max_users ?? '∞'} · Mesas: {p.max_tables ?? '∞'} · Comandas: {p.max_open_tabs ?? '∞'}
                </td>
                <td className="px-4 py-3">
                  {p.show_on_landing_page
                    ? <span className="inline-flex items-center gap-1 text-xs text-green-700"><Eye className="h-3 w-3" />Landing</span>
                    : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><EyeOff className="h-3 w-3" />Oculto</span>}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={p.status === 'ativo' ? 'default' : 'outline'}>{p.status}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => onToggleStatus(p)}><Power className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Nenhum plano encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        {creating && <PlanFormDialog initial={EMPTY} title="Novo plano" onClose={() => setCreating(false)} onSave={async (v) => {
          await adminCreatePlan(v); toast.success('Plano criado'); setCreating(false); await load();
        }} />}
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && <PlanFormDialog initial={editing as unknown as PlanInput} title={`Editar plano: ${editing.name}`} onClose={() => setEditing(null)} onSave={async (v) => {
          await adminUpdatePlan(editing.id, v); toast.success('Plano atualizado'); setEditing(null); await load();
        }} />}
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir plano "{confirmDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Planos com clientes vinculados não podem ser excluídos — desative-os em vez disso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && onDelete(confirmDelete)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PlanFormDialog({
  initial, title, onSave, onClose,
}: {
  initial: PlanInput; title: string;
  onSave: (v: PlanInput) => Promise<void>;
  onClose: () => void;
}) {
  const [v, setV] = useState<PlanInput>({ ...initial });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof PlanInput>(k: K, val: PlanInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const submit = async () => {
    if (!v.name) { toast.error('Nome é obrigatório'); return; }
    setSaving(true);
    try { await onSave(v); } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };
  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identificação</h3>
        <div className="grid grid-cols-2 gap-3">
          <F label="Nome*"><Input value={v.name} onChange={(e) => set('name', e.target.value)} /></F>
          <F label="Slug"><Input value={v.slug ?? ''} onChange={(e) => set('slug', e.target.value)} placeholder="basico" /></F>
        </div>
        <F label="Descrição curta"><Input value={v.short_description ?? ''} onChange={(e) => set('short_description', e.target.value)} /></F>
        <F label="Descrição completa"><Textarea rows={3} value={v.full_description ?? ''} onChange={(e) => set('full_description', e.target.value)} /></F>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preço e teste</h3>
        <div className="grid grid-cols-3 gap-3">
          <F label="Preço mensal (R$)"><Input type="number" step="0.01" value={v.monthly_price ?? 0} onChange={(e) => set('monthly_price', Number(e.target.value))} /></F>
          <F label="Preço anual (R$)"><Input type="number" step="0.01" value={v.annual_price ?? 0} onChange={(e) => set('annual_price', Number(e.target.value))} /></F>
          <F label="Dias de trial"><Input type="number" value={v.trial_days ?? 0} onChange={(e) => set('trial_days', Number(e.target.value))} /></F>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Limites</h3>
        <div className="grid grid-cols-4 gap-3">
          <F label="Usuários"><LimitInput value={v.max_users} onChange={(n) => set('max_users', n)} /></F>
          <F label="Mesas"><LimitInput value={v.max_tables} onChange={(n) => set('max_tables', n)} /></F>
          <F label="Comandas abertas"><LimitInput value={v.max_open_tabs} onChange={(n) => set('max_open_tabs', n)} /></F>
          <F label="Produtos"><LimitInput value={v.max_products} onChange={(n) => set('max_products', n)} /></F>
        </div>
        <p className="text-[11px] text-muted-foreground">Deixe em branco para ilimitado.</p>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Módulos liberados</h3>
        <div className="grid grid-cols-2 gap-3">
          <Tog label="Mesas" value={!!v.allow_tables_module} onChange={(b) => set('allow_tables_module', b)} />
          <Tog label="Comandas" value={!!v.allow_tabs_module} onChange={(b) => set('allow_tabs_module', b)} />
          <Tog label="Cozinha / KDS" value={!!v.allow_kitchen_module} onChange={(b) => set('allow_kitchen_module', b)} />
          <Tog label="Caixa" value={!!v.allow_cash_register_module} onChange={(b) => set('allow_cash_register_module', b)} />
          <Tog label="Dashboard avançado" value={!!v.allow_advanced_dashboard} onChange={(b) => set('allow_advanced_dashboard', b)} />
          <Tog label="Relatórios" value={!!v.allow_reports} onChange={(b) => set('allow_reports', b)} />
          <Tog label="Personalização visual" value={!!v.allow_visual_customization} onChange={(b) => set('allow_visual_customization', b)} />
        </div>
        <F label="Nível de suporte">
          <Select value={v.support_level ?? 'padrao'} onValueChange={(s) => set('support_level', s)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="basico">Básico</SelectItem>
              <SelectItem value="padrao">Padrão</SelectItem>
              <SelectItem value="prioritario">Prioritário</SelectItem>
              <SelectItem value="dedicado">Dedicado</SelectItem>
            </SelectContent>
          </Select>
        </F>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Visibilidade</h3>
        <div className="grid grid-cols-2 gap-3">
          <Tog label="Exibir na Landing Page" value={!!v.show_on_landing_page} onChange={(b) => set('show_on_landing_page', b)} />
          <Tog label="Plano em destaque" value={!!v.is_featured} onChange={(b) => set('is_featured', b)} />
          <F label="Ordem de exibição"><Input type="number" value={v.display_order ?? 0} onChange={(e) => set('display_order', Number(e.target.value))} /></F>
          <F label="Status">
            <Select value={v.status ?? 'ativo'} onValueChange={(s) => set('status', s as 'ativo' | 'inativo')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </F>
        </div>
      </section>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={submit} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

function Tog({ label, value, onChange }: { label: string; value: boolean; onChange: (b: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 cursor-pointer">
      <span className="text-sm">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </label>
  );
}

function LimitInput({ value, onChange }: { value: number | null | undefined; onChange: (n: number | null) => void }) {
  return (
    <Input
      type="number" min={0}
      value={value ?? ''}
      placeholder="∞"
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    />
  );
}
