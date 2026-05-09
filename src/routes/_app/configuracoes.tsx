import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';

export const Route = createFileRoute('/_app/configuracoes')({
  component: ConfigPage,
});

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
        <TabsList>
          <TabsTrigger value="empresa">Empresa</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro & Cozinha</TabsTrigger>
          <TabsTrigger value="mesas">Mesas</TabsTrigger>
          <TabsTrigger value="categorias">Categorias</TabsTrigger>
        </TabsList>

        <TabsContent value="empresa"><CompanyTab/></TabsContent>
        <TabsContent value="financeiro"><SettingsTab/></TabsContent>
        <TabsContent value="mesas"><TablesTab/></TabsContent>
        <TabsContent value="categorias"><CategoriesTab/></TabsContent>
      </Tabs>
    </div>
  );
}

function CompanyTab() {
  const { profile, refresh } = useAuth();
  const [name, setName] = useState(''); const [trade, setTrade] = useState(''); const [doc, setDoc] = useState('');
  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data } = await supabase.from('companies').select('*').eq('id', profile.company_id).single();
      if (data) { setName(data.name); setTrade(data.trade_name ?? ''); setDoc(data.document ?? ''); }
    })();
  }, [profile?.company_id]);
  const save = async () => {
    await supabase.from('companies').update({ name, trade_name: trade, document: doc }).eq('id', profile!.company_id);
    toast.success('Salvo'); refresh();
  };
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3 mt-4">
      <div><Label>Razão social</Label><Input value={name} onChange={(e) => setName(e.target.value)}/></div>
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
  return (
    <div className="rounded-xl border border-border bg-card p-5 mt-4">
      <div className="flex gap-2 mb-4">
        <Input placeholder="Nº" type="number" className="w-20" value={num} onChange={(e) => setNum(e.target.value)}/>
        <Input placeholder="Nome (opcional)" value={name} onChange={(e) => setName(e.target.value)}/>
        <Button onClick={add}><Plus className="h-4 w-4"/></Button>
      </div>
      <ul className="divide-y divide-border">
        {tables.map((t) => (
          <li key={t.id} className="flex items-center justify-between py-2">
            <span><span className="font-display text-lg mr-2">{String(t.number).padStart(2,'0')}</span> <span className="text-sm text-muted-foreground">{t.name}</span></span>
            <Button variant="ghost" size="icon" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4 text-danger"/></Button>
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
