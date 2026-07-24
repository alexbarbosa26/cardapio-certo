import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useTenantBranding } from '@/hooks/use-tenant-branding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DecimalInput } from '@/components/ui/decimal-input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import {
  Copy, ExternalLink, Download, Plus, ArrowUp, ArrowDown, Trash2, Edit2, QrCode,
} from 'lucide-react';
import { WEEKDAYS } from '@/lib/digital-menu';
import { fmtBRL } from '@/lib/format';

type Settings = {
  company_id: string;
  display_name: string | null;
  presentation: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  instagram: string | null;
  cover_url: string | null;
  primary_color: string | null;
  avg_prep_min: number;
  min_order_amount: number;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  accepting_orders: boolean;
  delivery_fee: number;
  free_delivery_min: number | null;
  notes: string | null;
};

type Category = { id: string; name: string; description: string | null; sort_order: number; active: boolean };
type Item = {
  id: string; category_id: string | null; product_id: string | null;
  name: string; description: string | null; price: number; image_url: string | null;
  active: boolean; available_delivery: boolean; featured: boolean; sold_out: boolean;
  sort_order: number; extra_prep_min: number;
};
type Product = { id: string; name: string; price: number };
type Hours = {
  weekday: number; is_open: boolean;
  period1_start: string | null; period1_end: string | null;
  period2_start: string | null; period2_end: string | null;
};

export default function CardapioDigital() {
  const { profile } = useAuth();
  const branding = useTenantBranding();
  const [company, setCompany] = useState<{ digital_menu_contracted: boolean; digital_menu_enabled: boolean; digital_menu_slug: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.company_id) return;
    (async () => {
      const { data } = await supabase
        .from('companies')
        .select('digital_menu_contracted, digital_menu_enabled, digital_menu_slug')
        .eq('id', profile.company_id).maybeSingle();
      setCompany(data as any);
      setLoading(false);
    })();
  }, [profile?.company_id]);

  if (profile && profile.role !== 'admin') return <Navigate to="/mesas" replace />;
  if (loading) return <div className="p-8 text-muted-foreground">Carregando…</div>;

  if (!company?.digital_menu_contracted) {
    return (
      <div className="p-4 sm:p-8 max-w-3xl mx-auto">
        <Card>
          <CardHeader><CardTitle>Cardápio Digital</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>O módulo de Cardápio Digital e Delivery ainda não está contratado para sua empresa.</p>
            <p>Fale com o suporte para habilitar o recurso.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cardápio Digital</h1>
          <p className="text-sm text-muted-foreground">Configure seu cardápio online e gere o link público.</p>
        </div>
        <EnableToggle enabled={!!company.digital_menu_enabled} onChange={async (v) => {
          const { error } = await supabase.from('companies').update({ digital_menu_enabled: v }).eq('id', profile!.company_id);
          if (error) return toast.error('Não foi possível atualizar.');
          setCompany({ ...company, digital_menu_enabled: v });
          toast.success(v ? 'Cardápio ativado.' : 'Cardápio desativado.');
          void branding.refresh();
        }} />
      </header>

      <Tabs defaultValue="config">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="config">Configurações</TabsTrigger>
          <TabsTrigger value="hours">Horários</TabsTrigger>
          <TabsTrigger value="categories">Categorias</TabsTrigger>
          <TabsTrigger value="items">Itens</TabsTrigger>
          <TabsTrigger value="link">Link & QR Code</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-4"><SettingsTab companyId={profile!.company_id} slug={company.digital_menu_slug} onSlug={(s) => setCompany({ ...company, digital_menu_slug: s })} /></TabsContent>
        <TabsContent value="hours" className="mt-4"><HoursTab companyId={profile!.company_id} /></TabsContent>
        <TabsContent value="categories" className="mt-4"><CategoriesTab companyId={profile!.company_id} /></TabsContent>
        <TabsContent value="items" className="mt-4"><ItemsTab companyId={profile!.company_id} /></TabsContent>
        <TabsContent value="link" className="mt-4"><LinkTab slug={company.digital_menu_slug} enabled={!!company.digital_menu_enabled} /></TabsContent>
      </Tabs>
    </div>
  );
}

function EnableToggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <Switch checked={enabled} onCheckedChange={onChange} />
      {enabled ? 'Cardápio ativo' : 'Cardápio inativo'}
    </label>
  );
}

/* ---------------- Settings ---------------- */
function SettingsTab({ companyId, slug, onSlug }: { companyId: string; slug: string | null; onSlug: (s: string | null) => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [slugInput, setSlugInput] = useState(slug ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('digital_menu_settings').select('*').eq('company_id', companyId).maybeSingle();
      if (data) setS(data as Settings);
      else setS(defaultsFor(companyId));
    })();
  }, [companyId]);

  if (!s) return <div className="text-muted-foreground text-sm">Carregando…</div>;

  const save = async () => {
    setSaving(true);
    try {
      const clean = slugInput.trim().toLowerCase();
      if (clean && !/^[a-z0-9][a-z0-9-]{2,39}$/.test(clean)) {
        toast.error('Slug inválido. Use 3–40 caracteres: letras minúsculas, números e hífens.');
        return;
      }
      if ((clean || null) !== slug) {
        const { error } = await supabase.from('companies').update({ digital_menu_slug: clean || null }).eq('id', companyId);
        if (error) { toast.error(error.message.includes('unique') || error.code === '23505' ? 'Slug já em uso.' : 'Não foi possível salvar o slug.'); return; }
        onSlug(clean || null);
      }
      const { error: e2 } = await supabase.from('digital_menu_settings').upsert(s, { onConflict: 'company_id' });
      if (e2) { toast.error('Não foi possível salvar as configurações.'); return; }
      toast.success('Configurações salvas.');
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Slug público (URL)">
            <div className="flex items-center rounded-md border border-input">
              <span className="px-3 text-xs text-muted-foreground border-r border-input">/cardapio/</span>
              <Input value={slugInput} onChange={(e) => setSlugInput(e.target.value)} placeholder="minha-loja" className="border-0 focus-visible:ring-0" />
            </div>
          </Field>
          <Field label="Nome exibido">
            <Input value={s.display_name ?? ''} onChange={(e) => setS({ ...s, display_name: e.target.value })} />
          </Field>
          <Field label="Telefone">
            <Input value={s.phone ?? ''} onChange={(e) => setS({ ...s, phone: e.target.value })} />
          </Field>
          <Field label="WhatsApp">
            <Input value={s.whatsapp ?? ''} onChange={(e) => setS({ ...s, whatsapp: e.target.value })} />
          </Field>
          <Field label="Endereço" className="sm:col-span-2">
            <Input value={s.address ?? ''} onChange={(e) => setS({ ...s, address: e.target.value })} />
          </Field>
          <Field label="Instagram (@usuario)">
            <Input value={s.instagram ?? ''} onChange={(e) => setS({ ...s, instagram: e.target.value })} />
          </Field>
          <Field label="Cor principal (#RRGGBB)">
            <div className="flex items-center gap-2">
              <Input value={s.primary_color ?? ''} onChange={(e) => setS({ ...s, primary_color: e.target.value })} placeholder="#111827" />
              <input type="color" value={s.primary_color ?? '#111827'} onChange={(e) => setS({ ...s, primary_color: e.target.value })} className="h-9 w-10 rounded border" />
            </div>
          </Field>
          <Field label="Logo (URL)">
            <Input value={s.cover_url ?? ''} onChange={(e) => setS({ ...s, cover_url: e.target.value })} placeholder="https://..." />
            <p className="mt-1 text-[11px] text-muted-foreground">Use uma imagem panorâmica de fundo (opcional). O logo da empresa é usado automaticamente.</p>
          </Field>
          <Field label="Apresentação" className="sm:col-span-2">
            <Textarea rows={3} value={s.presentation ?? ''} onChange={(e) => setS({ ...s, presentation: e.target.value })} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Tempo médio de preparo (min)">
            <Input type="number" min={0} value={s.avg_prep_min} onChange={(e) => setS({ ...s, avg_prep_min: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Pedido mínimo">
            <DecimalInput value={s.min_order_amount} onChange={(v) => setS({ ...s, min_order_amount: Number.isFinite(v) ? v : 0 })} />
          </Field>
          <Field label="Taxa de entrega fixa">
            <DecimalInput value={s.delivery_fee} onChange={(v) => setS({ ...s, delivery_fee: Number.isFinite(v) ? v : 0 })} />
          </Field>
        </div>

        <div className="flex flex-wrap gap-6">
          <SwitchRow label="Entrega habilitada" checked={s.delivery_enabled} onChange={(v) => setS({ ...s, delivery_enabled: v })} />
          <SwitchRow label="Retirada habilitada" checked={s.pickup_enabled} onChange={(v) => setS({ ...s, pickup_enabled: v })} />
          <SwitchRow label="Aceitando pedidos" checked={s.accepting_orders} onChange={(v) => setS({ ...s, accepting_orders: v })} />
        </div>

        <Field label="Observações gerais">
          <Textarea rows={2} value={s.notes ?? ''} onChange={(e) => setS({ ...s, notes: e.target.value })} />
        </Field>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar configurações'}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function defaultsFor(companyId: string): Settings {
  return {
    company_id: companyId, display_name: null, presentation: null, phone: null, whatsapp: null,
    address: null, instagram: null, cover_url: null, primary_color: null,
    avg_prep_min: 30, min_order_amount: 0, delivery_enabled: true, pickup_enabled: true,
    accepting_orders: true, delivery_fee: 0, free_delivery_min: null, notes: null,
  };
}

/* ---------------- Hours ---------------- */
function HoursTab({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<Hours[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('digital_menu_hours').select('weekday,is_open,period1_start,period1_end,period2_start,period2_end').eq('company_id', companyId);
      const byDay = new Map<number, Hours>();
      (data as Hours[] | null)?.forEach((r) => byDay.set(r.weekday, r));
      const all: Hours[] = Array.from({ length: 7 }, (_, i) => byDay.get(i) ?? { weekday: i, is_open: false, period1_start: '18:00', period1_end: '23:00', period2_start: null, period2_end: null });
      setRows(all);
    })();
  }, [companyId]);

  const save = async () => {
    const payload = rows.map((r) => ({ ...r, company_id: companyId }));
    const { error } = await supabase.from('digital_menu_hours').upsert(payload, { onConflict: 'company_id,weekday' });
    if (error) return toast.error('Não foi possível salvar horários.');
    toast.success('Horários salvos.');
  };

  const update = (idx: number, patch: Partial<Hours>) => setRows((r) => r.map((x, i) => i === idx ? { ...x, ...patch } : x));

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        {rows.map((r, i) => (
          <div key={r.weekday} className="grid gap-2 sm:grid-cols-[120px_100px_1fr_1fr] items-center rounded-md border border-border p-3">
            <div className="font-medium">{WEEKDAYS[r.weekday]}</div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={r.is_open} onCheckedChange={(v) => update(i, { is_open: v })} />
              {r.is_open ? 'Aberto' : 'Fechado'}
            </label>
            <TimeRange label="Período 1" enabled={r.is_open} start={r.period1_start} end={r.period1_end} onChange={(s, e) => update(i, { period1_start: s, period1_end: e })} />
            <TimeRange label="Período 2 (opcional)" enabled={r.is_open} start={r.period2_start} end={r.period2_end} onChange={(s, e) => update(i, { period2_start: s, period2_end: e })} />
          </div>
        ))}
        <div className="flex justify-end pt-2">
          <Button onClick={save}>Salvar horários</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TimeRange({ label, enabled, start, end, onChange }: {
  label: string; enabled: boolean; start: string | null; end: string | null;
  onChange: (start: string | null, end: string | null) => void;
}) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="flex items-center gap-1">
        <Input type="time" disabled={!enabled} value={start ?? ''} onChange={(e) => onChange(e.target.value || null, end)} className="h-9" />
        <span className="text-muted-foreground">—</span>
        <Input type="time" disabled={!enabled} value={end ?? ''} onChange={(e) => onChange(start, e.target.value || null)} className="h-9" />
      </div>
    </div>
  );
}

/* ---------------- Categories ---------------- */
function CategoriesTab({ companyId }: { companyId: string }) {
  const [cats, setCats] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Partial<Category> | null>(null);

  const load = async () => {
    const { data } = await supabase.from('digital_menu_categories').select('*').eq('company_id', companyId).order('sort_order').order('name');
    setCats((data as Category[] | null) ?? []);
  };
  useEffect(() => { void load(); }, [companyId]);

  const move = async (id: string, dir: -1 | 1) => {
    const idx = cats.findIndex((c) => c.id === id);
    const swap = idx + dir;
    if (swap < 0 || swap >= cats.length) return;
    const a = cats[idx], b = cats[swap];
    await supabase.from('digital_menu_categories').update({ sort_order: b.sort_order }).eq('id', a.id);
    await supabase.from('digital_menu_categories').update({ sort_order: a.sort_order }).eq('id', b.id);
    void load();
  };

  const save = async () => {
    if (!editing?.name?.trim()) return toast.error('Informe o nome.');
    const payload = {
      company_id: companyId,
      name: editing.name.trim(),
      description: editing.description ?? null,
      sort_order: editing.sort_order ?? cats.length,
      active: editing.active ?? true,
    };
    const { error } = editing.id
      ? await supabase.from('digital_menu_categories').update(payload).eq('id', editing.id)
      : await supabase.from('digital_menu_categories').insert(payload);
    if (error) return toast.error('Não foi possível salvar.');
    setEditing(null);
    void load();
  };

  const del = async (id: string) => {
    if (!confirm('Excluir categoria?')) return;
    const { error } = await supabase.from('digital_menu_categories').delete().eq('id', id);
    if (error) return toast.error('Não foi possível excluir (talvez existam itens vinculados).');
    void load();
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setEditing({ active: true, sort_order: cats.length })}><Plus className="h-4 w-4 mr-1" />Nova categoria</Button>
        </div>
        {cats.length === 0 ? (
          <div className="text-muted-foreground text-sm py-8 text-center">Nenhuma categoria ainda.</div>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {cats.map((c, i) => (
              <li key={c.id} className="flex items-center gap-2 p-3">
                <div className="flex flex-col">
                  <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === 0} onClick={() => move(c.id, -1)}><ArrowUp className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === cats.length - 1} onClick={() => move(c.id, 1)}><ArrowDown className="h-3 w-3" /></Button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{c.name} {!c.active && <span className="ml-2 text-xs text-muted-foreground">(inativa)</span>}</div>
                  {c.description && <div className="text-xs text-muted-foreground truncate">{c.description}</div>}
                </div>
                <Button size="icon" variant="ghost" onClick={() => setEditing(c)}><Edit2 className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => del(c.id)}><Trash2 className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
        )}

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing?.id ? 'Editar categoria' : 'Nova categoria'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Field label="Nome"><Input value={editing?.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
              <Field label="Descrição"><Input value={editing?.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
              <SwitchRow label="Ativa" checked={editing?.active ?? true} onChange={(v) => setEditing({ ...editing, active: v })} />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={save}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

/* ---------------- Items ---------------- */
function ItemsTab({ companyId }: { companyId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const [filterCat, setFilterCat] = useState<string>('all');

  const load = async () => {
    const [i, c, p] = await Promise.all([
      supabase.from('digital_menu_items').select('*').eq('company_id', companyId).order('sort_order').order('name'),
      supabase.from('digital_menu_categories').select('id,name,description,sort_order,active').eq('company_id', companyId).order('sort_order'),
      supabase.from('products').select('id,name,price').eq('company_id', companyId).order('name'),
    ]);
    setItems((i.data as Item[] | null) ?? []);
    setCats((c.data as Category[] | null) ?? []);
    setProducts((p.data as Product[] | null) ?? []);
  };
  useEffect(() => { void load(); }, [companyId]);

  const filtered = useMemo(() => items.filter((x) => filterCat === 'all' || x.category_id === filterCat), [items, filterCat]);

  const save = async () => {
    if (!editing?.name?.trim()) return toast.error('Informe o nome.');
    const payload = {
      company_id: companyId,
      category_id: editing.category_id ?? null,
      product_id: editing.product_id ?? null,
      name: editing.name.trim(),
      description: editing.description ?? null,
      price: Number(editing.price ?? 0),
      image_url: editing.image_url ?? null,
      active: editing.active ?? true,
      available_delivery: editing.available_delivery ?? true,
      featured: editing.featured ?? false,
      sold_out: editing.sold_out ?? false,
      sort_order: editing.sort_order ?? items.length,
      extra_prep_min: editing.extra_prep_min ?? 0,
    };
    const { error } = editing.id
      ? await supabase.from('digital_menu_items').update(payload).eq('id', editing.id)
      : await supabase.from('digital_menu_items').insert(payload);
    if (error) return toast.error('Não foi possível salvar.');
    setEditing(null);
    void load();
  };

  const del = async (id: string) => {
    if (!confirm('Excluir item?')) return;
    await supabase.from('digital_menu_items').delete().eq('id', id);
    void load();
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setEditing({ active: true, available_delivery: true, price: 0, sort_order: items.length })} disabled={cats.length === 0}>
            <Plus className="h-4 w-4 mr-1" />Novo item
          </Button>
        </div>

        {cats.length === 0 && <div className="text-sm text-muted-foreground">Crie uma categoria antes de cadastrar itens.</div>}

        {filtered.length === 0 ? (
          <div className="text-muted-foreground text-sm py-8 text-center">Nenhum item.</div>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {filtered.map((it) => (
              <li key={it.id} className="flex items-center gap-3 p-3">
                {it.image_url ? <img src={it.image_url} alt="" className="h-12 w-12 rounded object-cover border border-border" /> : <div className="h-12 w-12 rounded bg-muted" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{it.name}</span>
                    {it.featured && <span className="text-[10px] rounded bg-primary text-primary-foreground px-1.5 py-0.5">Destaque</span>}
                    {it.sold_out && <span className="text-[10px] rounded bg-muted px-1.5 py-0.5">Esgotado</span>}
                    {!it.active && <span className="text-[10px] rounded bg-muted px-1.5 py-0.5">Inativo</span>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{cats.find((c) => c.id === it.category_id)?.name ?? '—'} · {fmtBRL(it.price)}</div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setEditing(it)}><Edit2 className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => del(it.id)}><Trash2 className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
        )}

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editing?.id ? 'Editar item' : 'Novo item'}</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Vincular a produto existente (opcional)" className="sm:col-span-2">
                <Select value={editing?.product_id ?? 'none'} onValueChange={(v) => {
                  if (v === 'none') return setEditing({ ...editing, product_id: null });
                  const p = products.find((x) => x.id === v);
                  setEditing({ ...editing, product_id: v, name: editing?.name || p?.name, price: editing?.price ?? p?.price });
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecionar produto" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Nome"><Input value={editing?.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
              <Field label="Categoria">
                <Select value={editing?.category_id ?? ''} onValueChange={(v) => setEditing({ ...editing, category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Preço"><DecimalInput value={editing?.price ?? 0} onChange={(v) => setEditing({ ...editing, price: Number.isFinite(v) ? v : 0 })} /></Field>
              <Field label="Imagem (URL)"><Input value={editing?.image_url ?? ''} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} /></Field>
              <Field label="Descrição" className="sm:col-span-2"><Textarea rows={2} value={editing?.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
              <Field label="Tempo adicional de preparo (min)"><Input type="number" min={0} value={editing?.extra_prep_min ?? 0} onChange={(e) => setEditing({ ...editing, extra_prep_min: Number(e.target.value) || 0 })} /></Field>
              <div className="flex flex-wrap gap-4 sm:col-span-2">
                <SwitchRow label="Ativo" checked={editing?.active ?? true} onChange={(v) => setEditing({ ...editing, active: v })} />
                <SwitchRow label="Disponível para delivery" checked={editing?.available_delivery ?? true} onChange={(v) => setEditing({ ...editing, available_delivery: v })} />
                <SwitchRow label="Destaque" checked={editing?.featured ?? false} onChange={(v) => setEditing({ ...editing, featured: v })} />
                <SwitchRow label="Esgotado" checked={editing?.sold_out ?? false} onChange={(v) => setEditing({ ...editing, sold_out: v })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={save}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

/* ---------------- Link & QR ---------------- */
function LinkTab({ slug, enabled }: { slug: string | null; enabled: boolean }) {
  const [qr, setQr] = useState<string | null>(null);
  const url = slug ? `${window.location.origin}/cardapio/${slug}` : null;

  useEffect(() => {
    if (!url) { setQr(null); return; }
    QRCode.toDataURL(url, { width: 512, margin: 1 }).then(setQr).catch(() => setQr(null));
  }, [url]);

  if (!slug) {
    return <Card><CardContent className="pt-6 text-sm text-muted-foreground">Defina um slug em <b>Configurações</b> para gerar o link público.</CardContent></Card>;
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {!enabled && <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">O cardápio está inativo — o link mostrará uma página de indisponibilidade.</div>}
        <Field label="Link público">
          <div className="flex gap-2">
            <Input readOnly value={url ?? ''} />
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(url!); toast.success('Link copiado.'); }}><Copy className="h-4 w-4" /></Button>
            <Button variant="outline" asChild><a href={url!} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>
          </div>
        </Field>
        {qr && (
          <div className="flex flex-col items-start gap-3">
            <div className="text-sm font-medium flex items-center gap-1"><QrCode className="h-4 w-4" />QR Code</div>
            <img src={qr} alt="QR Code" className="h-56 w-56 rounded-md border border-border bg-white p-2" />
            <Button variant="outline" onClick={() => {
              const a = document.createElement('a');
              a.href = qr; a.download = `cardapio-${slug}.png`; a.click();
            }}><Download className="h-4 w-4 mr-1" />Baixar PNG</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- helpers ---------------- */
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="flex items-center gap-2 text-sm"><Switch checked={checked} onCheckedChange={onChange} />{label}</label>;
}
