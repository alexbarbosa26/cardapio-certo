import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Bike, Edit2, Plus, Trash2 } from 'lucide-react';

export type Driver = {
  id: string;
  name: string;
  phone: string | null;
  vehicle: string | null;
  plate: string | null;
  notes: string | null;
  active: boolean;
};

const empty = (): Omit<Driver, 'id'> => ({ name: '', phone: '', vehicle: '', plate: '', notes: '', active: true });

export async function fetchDrivers(companyId: string): Promise<Driver[]> {
  const { data, error } = await supabase
    .from('delivery_drivers')
    .select('id, name, phone, vehicle, plate, notes, active')
    .eq('company_id', companyId)
    .order('active', { ascending: false })
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export default function DriversTab({ companyId }: Readonly<{ companyId: string }>) {
  const [rows, setRows] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [form, setForm] = useState(empty());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setRows(await fetchDrivers(companyId));
    } catch {
      toast.error('Não foi possível carregar os entregadores.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [companyId]);

  const openNew = () => { setEditing(null); setForm(empty()); setOpen(true); };
  const openEdit = (d: Driver) => {
    setEditing(d);
    setForm({ name: d.name, phone: d.phone ?? '', vehicle: d.vehicle ?? '', plate: d.plate ?? '', notes: d.notes ?? '', active: d.active });
    setOpen(true);
  };

  const save = async () => {
    const name = form.name.trim();
    if (name.length < 2) { toast.error('Informe o nome do entregador.'); return; }
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        name,
        phone: form.phone?.trim() || null,
        vehicle: form.vehicle?.trim() || null,
        plate: form.plate?.trim() || null,
        notes: form.notes?.trim() || null,
        active: form.active,
      };
      const { error } = editing
        ? await supabase.from('delivery_drivers').update(payload).eq('id', editing.id)
        : await supabase.from('delivery_drivers').insert(payload);
      if (error) { toast.error('Não foi possível salvar o entregador.'); return; }
      toast.success(editing ? 'Entregador atualizado.' : 'Entregador cadastrado.');
      setOpen(false);
      await load();
    } finally { setSaving(false); }
  };

  const toggleActive = async (d: Driver) => {
    const { error } = await supabase.from('delivery_drivers').update({ active: !d.active }).eq('id', d.id);
    if (error) { toast.error('Não foi possível atualizar.'); return; }
    await load();
  };

  const remove = async (d: Driver) => {
    if (!confirm(`Excluir o entregador "${d.name}"? Os pedidos já entregues mantêm o histórico.`)) return;
    const { error } = await supabase.from('delivery_drivers').delete().eq('id', d.id);
    if (error) { toast.error('Não foi possível excluir.'); return; }
    toast.success('Entregador excluído.');
    await load();
  };

  let driversContent: React.ReactNode;
  if (loading) {
    driversContent = <div className="text-sm text-muted-foreground">Carregando…</div>;
  } else if (rows.length === 0) {
    driversContent = (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        Nenhum entregador cadastrado.
      </div>
    );
  } else {
    driversContent = (
      <ul className="divide-y rounded-lg border">
        {rows.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted"><Bike className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1">
              <div className="font-medium break-words">{d.name}</div>
              <div className="text-xs text-muted-foreground break-words">
                {[d.phone, d.vehicle, d.plate].filter(Boolean).join(' · ') || 'Sem dados adicionais'}
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={d.active} onCheckedChange={() => void toggleActive(d)} />
              {d.active ? 'Ativo' : 'Inativo'}
            </label>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => openEdit(d)}><Edit2 className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => void remove(d)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-medium">Entregadores</h3>
            <p className="text-sm text-muted-foreground">Cadastre a equipe de entrega para atribuir aos pedidos e medir os tempos.</p>
          </div>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo entregador</Button>
        </div>

        {driversContent}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Editar entregador' : 'Novo entregador'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Telefone</Label>
                <Input value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 99999-0000" />
              </div>
              <div className="space-y-1">
                <Label>Veículo</Label>
                <Input value={form.vehicle ?? ''} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} placeholder="Moto, bicicleta…" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Placa</Label>
              <Input value={form.plate ?? ''} onChange={(e) => setForm({ ...form, plate: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea rows={2} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /> Ativo
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
