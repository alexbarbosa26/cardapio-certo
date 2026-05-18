import { Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { applyTenantFontsPreview } from '@/hooks/use-tenant-typography';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function ConfigPage() {
  const { profile } = useAuth();
  if (profile && profile.role !== 'admin') return <Navigate to="/mesas" />;

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Sistema</p>
        <h1 className="font-display text-3xl sm:text-4xl mt-1">Configurações</h1>
      </header>

      <Tabs defaultValue="empresa">
        <div className="-mx-4 sm:mx-0 overflow-x-auto">
          <TabsList className="w-max sm:w-full inline-flex sm:flex mx-4 sm:mx-0">
            <TabsTrigger value="empresa">Empresa</TabsTrigger>
            <TabsTrigger value="financeiro">Financeiro & Cozinha</TabsTrigger>
            <TabsTrigger value="tipografia">Tipografia</TabsTrigger>
            <TabsTrigger value="mesas">Mesas</TabsTrigger>
            <TabsTrigger value="categorias">Categorias</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="empresa"><CompanyTab/></TabsContent>
        <TabsContent value="financeiro"><SettingsTab/></TabsContent>
        <TabsContent value="tipografia"><TypographyTab/></TabsContent>
        <TabsContent value="mesas"><TablesTab/></TabsContent>
        <TabsContent value="categorias"><CategoriesTab/></TabsContent>
      </Tabs>
    </div>
  );
}

function CompanyTab() {
  const { profile, refresh } = useAuth();
  const [name, setName] = useState(''); const [trade, setTrade] = useState(''); const [doc, setDoc] = useState('');
  const [logoUrl, setLogoUrl] = useState<string>(''); const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data } = await supabase.from('companies').select('*').eq('id', profile.company_id).single();
      if (data) { setName(data.name); setTrade(data.trade_name ?? ''); setDoc(data.document ?? ''); setLogoUrl(data.logo_url ?? ''); }
    })();
  }, [profile?.company_id]);
  const save = async () => {
    await supabase.from('companies').update({ name, trade_name: trade, document: doc, logo_url: logoUrl || null }).eq('id', profile!.company_id);
    toast.success('Salvo'); refresh();
  };
  const onUpload = async (file: File) => {
    if (!profile) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Imagem deve ter até 2MB'); return; }
    setUploading(true);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `${profile.company_id}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('branding').upload(path, file, { upsert: true, contentType: file.type });
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data: pub } = supabase.storage.from('branding').getPublicUrl(path);
    setLogoUrl(pub.publicUrl);
    await supabase.from('companies').update({ logo_url: pub.publicUrl }).eq('id', profile.company_id);
    setUploading(false); toast.success('Logo atualizada');
  };
  const removeLogo = async () => {
    setLogoUrl('');
    await supabase.from('companies').update({ logo_url: null }).eq('id', profile!.company_id);
    toast.success('Logo removida');
  };
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3 mt-4">
      <div>
        <Label>Logo da impressão</Label>
        <div className="flex items-center gap-3 mt-1">
          <div className="h-20 w-20 rounded-md border border-border bg-background flex items-center justify-center overflow-hidden">
            {logoUrl
              ? <img src={logoUrl} alt="logo" className="max-h-full max-w-full object-contain"/>
              : <span className="text-[10px] text-muted-foreground text-center px-1">Sem logo</span>}
          </div>
          <div className="flex flex-col gap-1">
            <Input type="file" accept="image/*" disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
            {logoUrl && <Button type="button" variant="ghost" size="sm" onClick={removeLogo}>Remover logo</Button>}
            <p className="text-xs text-muted-foreground">PNG/JPG até 2MB. Aparece no topo da comanda e da conta.</p>
          </div>
        </div>
      </div>
      <div><Label>Razão social (cabeçalho da impressão)</Label><Input value={name} onChange={(e) => setName(e.target.value)}/></div>
      <div><Label>Nome fantasia</Label><Input value={trade} onChange={(e) => setTrade(e.target.value)}/></div>
      <div><Label>CNPJ</Label><Input value={doc} onChange={(e) => setDoc(e.target.value)}/></div>
      <Button onClick={save}>Salvar</Button>
    </div>
  );
}

function SettingsTab() {
  const { profile } = useAuth();
  const [s, setS] = useState<any>(null);
  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data } = await supabase.from('settings').select('*').eq('company_id', profile.company_id).maybeSingle();
      setS(data ?? { company_id: profile.company_id, service_fee_percentage: 10, debit_fee_percentage: 1.37, credit_fee_percentage: 3.17, kitchen_warning_minutes: 10, kitchen_danger_minutes: 20 });
    })();
  }, [profile?.company_id]);
  const save = async () => {
    await supabase.from('settings').upsert({ ...s, company_id: profile!.company_id }, { onConflict: 'company_id' });
    toast.success('Configurações salvas');
  };
  if (!s) return null;
  const F = (k: string, label: string, step = '0.01') => (
    <div><Label>{label}</Label><Input type="number" step={step} value={s[k] ?? 0} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })}/></div>
  );
  return (
    <div className="rounded-xl border border-border bg-card p-5 mt-4 space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        {F('service_fee_percentage', 'Taxa de serviço (%)')}
        {F('debit_fee_percentage', 'Taxa débito (%)')}
        {F('credit_fee_percentage', 'Taxa crédito (%)')}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {F('kitchen_warning_minutes', 'Alerta cozinha (min)', '1')}
        {F('kitchen_danger_minutes', 'Atraso cozinha (min)', '1')}
      </div>
      <Button onClick={save}>Salvar</Button>
    </div>
  );
}

function TablesTab() {
  const { profile } = useAuth();
  const [tables, setTables] = useState<any[]>([]);
  const [num, setNum] = useState(''); const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNum, setEditNum] = useState(''); const [editName, setEditName] = useState('');
  const load = async () => {
    if (!profile) return;
    const { data } = await supabase.from('tables').select('*').eq('company_id', profile.company_id).order('number');
    setTables(data ?? []);
  };
  useEffect(() => { load(); }, [profile?.company_id]);
  const add = async () => {
    if (!profile) return;
    const n = Number(num); if (!n) { toast.error('Número inválido'); return; }
    const { error } = await supabase.from('tables').insert({
      company_id: profile.company_id, number: n, name: name || `Mesa ${String(n).padStart(2,'0')}`,
    });
    if (error) { toast.error(error.message); return; }
    setNum(''); setName(''); load();
  };
  const remove = async (id: string) => {
    if (!confirm('Remover mesa?')) return;
    const { error } = await supabase.from('tables').delete().eq('id', id);
    if (error) toast.error(error.message); else load();
  };
  const startEdit = (t: any) => {
    setEditingId(t.id); setEditNum(String(t.number)); setEditName(t.name ?? '');
  };
  const cancelEdit = () => { setEditingId(null); setEditNum(''); setEditName(''); };
  const saveEdit = async (id: string) => {
    const n = Number(editNum); if (!n) { toast.error('Número inválido'); return; }
    const { error } = await supabase.from('tables').update({
      number: n, name: editName || `Mesa ${String(n).padStart(2,'0')}`,
    }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    cancelEdit(); load(); toast.success('Mesa atualizada');
  };
  return (
    <div className="rounded-xl border border-border bg-card p-5 mt-4">
      <div className="flex gap-2 mb-4">
        <Input placeholder="Nº" type="number" className="w-20" value={num} onChange={(e) => setNum(e.target.value)}/>
        <Input placeholder="Nome (opcional)" value={name} onChange={(e) => setName(e.target.value)}/>
        <Button onClick={add}><Plus className="h-4 w-4"/></Button>
      </div>
      <ul className="divide-y divide-border">
        {tables.map((t) => (
          <li key={t.id} className="flex items-center justify-between py-2 gap-2">
            {editingId === t.id ? (
              <>
                <div className="flex gap-2 flex-1">
                  <Input type="number" className="w-20" value={editNum} onChange={(e) => setEditNum(e.target.value)}/>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nome (opcional)"/>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => saveEdit(t.id)}><Check className="h-4 w-4 text-success"/></Button>
                  <Button variant="ghost" size="icon" onClick={cancelEdit}><X className="h-4 w-4"/></Button>
                </div>
              </>
            ) : (
              <>
                <span><span className="font-display text-lg mr-2">{String(t.number).padStart(2,'0')}</span> <span className="text-sm text-muted-foreground">{t.name}</span></span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => startEdit(t)}><Pencil className="h-4 w-4"/></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4 text-danger"/></Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CategoriesTab() {
  const { profile } = useAuth();
  const [cats, setCats] = useState<any[]>([]);
  const [name, setName] = useState('');
  const load = async () => {
    if (!profile) return;
    const { data } = await supabase.from('categories').select('*').eq('company_id', profile.company_id).order('sort_order');
    setCats(data ?? []);
  };
  useEffect(() => { load(); }, [profile?.company_id]);
  const add = async () => {
    if (!name.trim() || !profile) return;
    const { error } = await supabase.from('categories').insert({
      company_id: profile.company_id, name, sort_order: cats.length,
    });
    if (error) toast.error(error.message); else { setName(''); load(); }
  };
  const remove = async (id: string) => {
    if (!confirm('Remover categoria?')) return;
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) toast.error(error.message); else load();
  };
  return (
    <div className="rounded-xl border border-border bg-card p-5 mt-4">
      <div className="flex gap-2 mb-4">
        <Input placeholder="Nova categoria" value={name} onChange={(e) => setName(e.target.value)}/>
        <Button onClick={add}><Plus className="h-4 w-4"/></Button>
      </div>
      <ul className="divide-y divide-border">
        {cats.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2">
            <span>{c.name}</span>
            <Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4 text-danger"/></Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const FONT_OPTIONS = [
  { value: 'system', label: 'Sistema (sem Google Fonts)' },
  { value: 'Inter', label: 'Inter (padrão)' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Open Sans', label: 'Open Sans' },
  { value: 'Lato', label: 'Lato' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Poppins', label: 'Poppins' },
  { value: 'Nunito', label: 'Nunito' },
  { value: 'Raleway', label: 'Raleway' },
  { value: 'Playfair Display', label: 'Playfair Display (serif)' },
  { value: 'Merriweather', label: 'Merriweather (serif)' },
  { value: 'Lora', label: 'Lora (serif)' },
  { value: 'DM Serif Display', label: 'DM Serif Display' },
  { value: 'Space Grotesk', label: 'Space Grotesk' },
  { value: 'Manrope', label: 'Manrope' },
  { value: 'Bebas Neue', label: 'Bebas Neue' },
  { value: 'Oswald', label: 'Oswald' },
];

const WEIGHT_PRESETS = [
  { value: '400;700', label: 'Regular + Bold (leve)' },
  { value: '400;500;600;700', label: 'Regular → Bold (padrão)' },
  { value: '300;400;500;600;700;800', label: 'Light → ExtraBold (completo)' },
  { value: '400', label: 'Apenas Regular' },
];

function TypographyTab() {
  const { profile } = useAuth();
  const [s, setS] = useState<any>(null);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data } = await supabase
        .from('settings')
        .select('*')
        .eq('company_id', profile.company_id)
        .maybeSingle();
      setS(data ?? {
        company_id: profile.company_id,
        font_display: 'Inter',
        font_body: 'Inter',
        font_display_weights: '400;500;600;700',
        font_body_weights: '400;500;600;700',
      });
    })();
  }, [profile?.company_id]);

  if (!s) return null;

  const update = (patch: any) => {
    const next = { ...s, ...patch };
    setS(next);
    applyTenantFontsPreview(
      next.font_display ?? 'Inter',
      next.font_body ?? 'Inter',
      next.font_display_weights ?? '400;500;600;700',
      next.font_body_weights ?? '400;500;600;700',
    );
  };

  const save = async () => {
    const { error } = await supabase
      .from('settings')
      .upsert({ ...s, company_id: profile!.company_id }, { onConflict: 'company_id' });
    if (error) { toast.error(error.message); return; }
    toast.success('Tipografia salva');
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 mt-4 space-y-6">
      <p className="text-sm text-muted-foreground">
        Personalize a identidade tipográfica do seu restaurante. As fontes são carregadas do Google Fonts.
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Fonte de títulos (display)</Label>
          <Select value={s.font_display ?? 'Inter'} onValueChange={(v) => update({ font_display: v })}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Label className="text-xs text-muted-foreground">Variações (pesos)</Label>
          <Select value={s.font_display_weights ?? '400;500;600;700'} onValueChange={(v) => update({ font_display_weights: v })}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>
              {WEIGHT_PRESETS.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            placeholder="Personalizado: 400;600;800"
            value={s.font_display_weights ?? ''}
            onChange={(e) => update({ font_display_weights: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>Fonte do corpo (body)</Label>
          <Select value={s.font_body ?? 'Inter'} onValueChange={(v) => update({ font_body: v })}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Label className="text-xs text-muted-foreground">Variações (pesos)</Label>
          <Select value={s.font_body_weights ?? '400;500;600;700'} onValueChange={(v) => update({ font_body_weights: v })}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>
              {WEIGHT_PRESETS.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            placeholder="Personalizado: 400;700"
            value={s.font_body_weights ?? ''}
            onChange={(e) => update({ font_body_weights: e.target.value })}
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Pré-visualização</p>
        <h2 className="font-display text-3xl mb-2">Cardápio do Chef</h2>
        <p className="text-base">
          O melhor sabor da cidade, preparado com ingredientes frescos e selecionados todos os dias.
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Texto secundário · 14px · peso regular
        </p>
      </div>

      <Button onClick={save}>Salvar tipografia</Button>
    </div>
  );
}

export default ConfigPage;
