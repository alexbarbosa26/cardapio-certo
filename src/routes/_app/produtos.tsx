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
          <DialogContent>
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
