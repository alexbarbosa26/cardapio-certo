import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { fmtBRL } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/produtos')({
  component: ProdutosPage,
});

interface Product { id: string; name: string; price: number; status: string; sends_to_kitchen: boolean; category_id: string | null; }
interface Category { id: string; name: string; }

function ProdutosPage() {
  const { profile } = useAuth();
  if (profile && profile.role !== 'admin') return <Navigate to="/mesas" />;

  const [products, setProducts] = useState<Product[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Partial<Product> | null>(null);

  const load = async () => {
    if (!profile) return;
    const { data: p } = await supabase.from('products').select('*').eq('company_id', profile.company_id).order('name');
    const { data: c } = await supabase.from('categories').select('id, name').eq('company_id', profile.company_id).order('name');
    setProducts((p ?? []).map((x: any) => ({ ...x, price: Number(x.price) })));
    setCats(c ?? []);
  };

  useEffect(() => { load(); }, [profile?.company_id]);

  const toggle = async (p: Product) => {
    await supabase.from('products').update({ status: p.status === 'ativo' ? 'inativo' : 'ativo' }).eq('id', p.id);
    load();
  };

  const save = async () => {
    if (!editing || !profile) return;
    if (!editing.name?.trim()) { toast.error('Nome obrigatório'); return; }
    const payload: any = {
      company_id: profile.company_id,
      name: editing.name, price: Number(editing.price) || 0,
      sends_to_kitchen: editing.sends_to_kitchen ?? true,
      category_id: editing.category_id || null,
      status: editing.status ?? 'ativo',
    };
    if (editing.id) {
      await supabase.from('products').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('products').insert(payload);
    }
    setEditing(null);
    toast.success('Salvo');
    load();
  };

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Cardápio</p>
          <h1 className="font-display text-3xl sm:text-4xl mt-1">Produtos</h1>
        </div>
        <Button onClick={() => setEditing({ sends_to_kitchen: true, status: 'ativo', price: 0 })}>
          <Plus className="h-4 w-4 mr-1" /> Novo produto
        </Button>
      </header>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-secondary/40">
            <tr>
              <th className="text-left px-4 py-2.5">Produto</th>
              <th className="text-left px-4 py-2.5 hidden sm:table-cell">Categoria</th>
              <th className="text-right px-4 py-2.5">Preço</th>
              <th className="text-center px-4 py-2.5 hidden sm:table-cell">Cozinha</th>
              <th className="text-center px-4 py-2.5">Ativo</th>
              <th className="text-right px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const cat = cats.find((c) => c.id === p.category_id);
              return (
                <tr key={p.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{cat?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtBRL(p.price)}</td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell text-xs text-muted-foreground">{p.sends_to_kitchen ? 'sim' : 'não'}</td>
                  <td className="px-4 py-3 text-center"><Switch checked={p.status === 'ativo'} onCheckedChange={() => toggle(p)} /></td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(p)}><Edit2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing.id ? 'Editar produto' : 'Novo produto'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Preço (R$)</Label><Input type="number" step="0.01" value={editing.price ?? 0} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} /></div>
                <div>
                  <Label>Categoria</Label>
                  <select value={editing.category_id ?? ''} onChange={(e) => setEditing({ ...editing, category_id: e.target.value || null })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">—</option>
                    {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div className="text-sm">Envia para cozinha</div>
                <Switch checked={editing.sends_to_kitchen ?? true} onCheckedChange={(v) => setEditing({ ...editing, sends_to_kitchen: v })} />
              </div>
              {editing.id && profile && (
                <OptionGroupsEditor productId={editing.id} companyId={profile.company_id} />
              )}
              {!editing.id && (
                <p className="text-xs text-muted-foreground">Salve o produto para configurar grupos de opções (ex: acompanhamentos).</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={save}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

interface OG { id: string; name: string; required: boolean; selection_type: 'unica' | 'multipla'; max_options: number | null; items: OI[]; }
interface OI { id: string; name: string; additional_price: number; }

function OptionGroupsEditor({ productId, companyId }: { productId: string; companyId: string }) {
  const [groups, setGroups] = useState<OG[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = async () => {
    const { data } = await supabase
      .from('option_groups')
      .select('id, name, required, selection_type, max_options, option_items(id, name, additional_price)')
      .eq('product_id', productId)
      .order('sort_order');
    setGroups((data ?? []).map((g: any) => ({
      id: g.id, name: g.name, required: g.required, selection_type: g.selection_type, max_options: g.max_options,
      items: (g.option_items ?? []).map((i: any) => ({ ...i, additional_price: Number(i.additional_price) })),
    })));
  };
  useEffect(() => { load(); }, [productId]);

  const addGroup = async () => {
    const { error } = await supabase.from('option_groups').insert({
      company_id: companyId, product_id: productId, name: 'Novo grupo',
      selection_type: 'unica', required: false,
    });
    if (error) { toast.error(error.message); return; }
    load();
  };

  const updateGroup = async (id: string, patch: Partial<OG>) => {
    await supabase.from('option_groups').update(patch as any).eq('id', id);
    load();
  };

  const deleteGroup = async (id: string) => {
    if (!confirm('Excluir este grupo e todas as suas opções?')) return;
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
    <div className="rounded-md border border-border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Grupos de opções</div>
          <div className="text-[11px] text-muted-foreground">Ex: acompanhamento (+R$ 4,00), ponto da carne, tamanho…</div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={addGroup}><Plus className="h-3 w-3 mr-1" /> Grupo</Button>
      </div>
      {groups.length === 0 && <p className="text-xs text-muted-foreground">Nenhum grupo cadastrado.</p>}
      {groups.map((g) => {
        const isOpen = open[g.id] ?? true;
        return (
          <div key={g.id} className="rounded-md border border-border bg-secondary/30">
            <div className="flex items-center gap-2 p-2">
              <button type="button" onClick={() => setOpen({ ...open, [g.id]: !isOpen })} className="text-muted-foreground">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <Input value={g.name} onChange={(e) => setGroups(groups.map(x => x.id === g.id ? { ...x, name: e.target.value } : x))}
                onBlur={(e) => updateGroup(g.id, { name: e.target.value })} className="h-8 flex-1" />
              <Button type="button" size="icon" variant="ghost" onClick={() => deleteGroup(g.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
            {isOpen && (
              <div className="px-3 pb-3 space-y-2">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <Label className="text-[10px] uppercase">Tipo</Label>
                    <select value={g.selection_type}
                      onChange={(e) => updateGroup(g.id, { selection_type: e.target.value as any })}
                      className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
                      <option value="unica">Única</option>
                      <option value="multipla">Múltipla</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase">Máx. (múltipla)</Label>
                    <Input type="number" min={0} value={g.max_options ?? ''} className="h-8"
                      onChange={(e) => updateGroup(g.id, { max_options: e.target.value ? Number(e.target.value) : null })} />
                  </div>
                  <div className="flex items-end justify-between rounded-md border border-border px-2 h-8">
                    <span className="text-[10px] uppercase text-muted-foreground">Obrigatório</span>
                    <Switch checked={g.required} onCheckedChange={(v) => updateGroup(g.id, { required: v })} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  {g.items.map((it) => (
                    <div key={it.id} className="flex items-center gap-2">
                      <Input value={it.name} className="h-8 flex-1"
                        onChange={(e) => setGroups(groups.map(x => x.id === g.id ? { ...x, items: x.items.map(y => y.id === it.id ? { ...y, name: e.target.value } : y) } : x))}
                        onBlur={(e) => updateItem(it.id, { name: e.target.value })} />
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">+R$</span>
                        <Input type="number" step="0.01" value={it.additional_price} className="h-8 w-20"
                          onChange={(e) => setGroups(groups.map(x => x.id === g.id ? { ...x, items: x.items.map(y => y.id === it.id ? { ...y, additional_price: Number(e.target.value) } : y) } : x))}
                          onBlur={(e) => updateItem(it.id, { additional_price: Number(e.target.value) })} />
                      </div>
                      <Button type="button" size="icon" variant="ghost" onClick={() => deleteItem(it.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
  );
}
