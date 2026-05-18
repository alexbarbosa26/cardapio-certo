import { Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

interface OI { id: string; name: string; additional_price: number; }
interface OG {
  id: string; name: string; required: boolean;
  selection_type: 'unica' | 'multipla'; max_options: number | null;
  items: OI[]; usage_count: number;
}

function GruposOpcoesPage() {
  const { profile } = useAuth();
  if (profile && profile.role !== 'admin') return <Navigate to="/mesas" />;

  const [groups, setGroups] = useState<OG[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = async () => {
    if (!profile) return;
    const { data, error } = await supabase
      .from('option_groups')
      .select('id, name, required, selection_type, max_options, option_items(id, name, additional_price), product_option_groups(product_id)')
      .eq('company_id', profile.company_id)
      .order('name');
    if (error) { toast.error(error.message); return; }
    setGroups((data ?? []).map((g: any) => ({
      id: g.id, name: g.name, required: g.required,
      selection_type: g.selection_type, max_options: g.max_options,
      items: (g.option_items ?? []).map((i: any) => ({ ...i, additional_price: Number(i.additional_price) })),
      usage_count: (g.product_option_groups ?? []).length,
    })));
  };
  useEffect(() => { load(); }, [profile?.company_id]);

  const addGroup = async () => {
    if (!profile) return;
    const { error } = await supabase.from('option_groups').insert({
      company_id: profile.company_id, name: 'Novo grupo',
      selection_type: 'unica', required: false,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Grupo criado');
    load();
  };

  const updateGroup = async (id: string, patch: Partial<OG>) => {
    await supabase.from('option_groups').update(patch as any).eq('id', id);
    load();
  };

  const deleteGroup = async (id: string, usage: number) => {
    const msg = usage > 0
      ? `Este grupo está associado a ${usage} produto(s). Excluir mesmo assim?`
      : 'Excluir este grupo e suas opções?';
    if (!confirm(msg)) return;
    await supabase.from('product_option_groups').delete().eq('option_group_id', id);
    await supabase.from('option_items').delete().eq('option_group_id', id);
    await supabase.from('option_groups').delete().eq('id', id);
    load();
  };

  const addItem = async (groupId: string) => {
    const { error } = await supabase.from('option_items').insert({
      option_group_id: groupId, name: 'Nova opção', additional_price: 0,
    });
    if (error) { toast.error(error.message); return; }
    load();
  };

  const updateItem = async (id: string, patch: Partial<OI>) => {
    await supabase.from('option_items').update(patch as any).eq('id', id);
    load();
  };

  const deleteItem = async (id: string) => {
    await supabase.from('option_items').delete().eq('id', id);
    load();
  };

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Cardápio</p>
          <h1 className="font-display text-3xl sm:text-4xl mt-1">Grupos de opções</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastre uma vez e associe a vários produtos. Alterações aqui valem para todos.
          </p>
        </div>
        <Button onClick={addGroup}><Plus className="h-4 w-4 mr-1" /> Novo grupo</Button>
      </header>

      <div className="space-y-3">
        {groups.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhum grupo cadastrado.
          </div>
        )}
        {groups.map((g) => {
          const isOpen = open[g.id] ?? false;
          return (
            <div key={g.id} className="rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 p-3">
                <button type="button" onClick={() => setOpen({ ...open, [g.id]: !isOpen })} className="text-muted-foreground">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <Input value={g.name}
                  onChange={(e) => setGroups(groups.map(x => x.id === g.id ? { ...x, name: e.target.value } : x))}
                  onBlur={(e) => updateGroup(g.id, { name: e.target.value })}
                  className="h-9 flex-1 font-medium" />
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {g.usage_count} produto(s)
                </span>
                <Button type="button" size="icon" variant="ghost" onClick={() => deleteGroup(g.id, g.usage_count)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {isOpen && (
                <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px] uppercase">Tipo</Label>
                      <select value={g.selection_type}
                        onChange={(e) => updateGroup(g.id, { selection_type: e.target.value as any })}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                        <option value="unica">Única</option>
                        <option value="multipla">Múltipla</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase">Máx. (múltipla)</Label>
                      <Input type="number" min={0} value={g.max_options ?? ''} className="h-9"
                        onChange={(e) => updateGroup(g.id, { max_options: e.target.value ? Number(e.target.value) : null })} />
                    </div>
                    <div className="flex items-end justify-between rounded-md border border-border px-3 h-9">
                      <span className="text-[10px] uppercase text-muted-foreground">Obrigatório</span>
                      <Switch checked={g.required} onCheckedChange={(v) => updateGroup(g.id, { required: v })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase text-muted-foreground">Opções</Label>
                    {g.items.map((it) => (
                      <div key={it.id} className="flex items-center gap-2">
                        <Input value={it.name} className="h-9 flex-1"
                          onChange={(e) => setGroups(groups.map(x => x.id === g.id ? { ...x, items: x.items.map(y => y.id === it.id ? { ...y, name: e.target.value } : y) } : x))}
                          onBlur={(e) => updateItem(it.id, { name: e.target.value })} />
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">+R$</span>
                          <Input type="number" step="0.01" value={it.additional_price} className="h-9 w-24"
                            onChange={(e) => setGroups(groups.map(x => x.id === g.id ? { ...x, items: x.items.map(y => y.id === it.id ? { ...y, additional_price: Number(e.target.value) } : y) } : x))}
                            onBlur={(e) => updateItem(it.id, { additional_price: Number(e.target.value) })} />
                        </div>
                        <Button type="button" size="icon" variant="ghost" onClick={() => deleteItem(it.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" size="sm" variant="ghost" onClick={() => addItem(g.id)}>
                      <Plus className="h-3 w-3 mr-1" /> Opção
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default GruposOpcoes;
