import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { fmtBRL } from '@/lib/format';
import { printThermal } from '@/lib/print-order';
import { Plus, Minus, Send, X, Printer, MoreVertical, Pencil, Repeat, Ban, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  tableId: string;
  orderId: string;
  tableName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

interface Product { id: string; name: string; price: number; sends_to_kitchen: boolean; category_id: string | null; }
interface Category { id: string; name: string; }
interface OptionItem { id: string; name: string; additional_price: number; }
interface OptionGroup { id: string; name: string; required: boolean; selection_type: 'unica' | 'multipla'; max_options: number | null; items: OptionItem[]; }

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes: string | null;
  kitchen_status: string;
  sends_to_kitchen: boolean;
  options: { option_group_name: string; option_item_name: string }[];
}

export function OrderSheet({ tableId, orderId, tableName, open, onOpenChange }: Props) {
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [activeCat, setActiveCat] = useState<string>('all');
  const [adding, setAdding] = useState<Product | null>(null);
  const [swapItemId, setSwapItemId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<OrderItem | null>(null);
  const [confirmCancelOrder, setConfirmCancelOrder] = useState(false);
  const [confirmCancelItem, setConfirmCancelItem] = useState<OrderItem | null>(null);
  const [brand, setBrand] = useState<{ name?: string; tradeName?: string; logoUrl?: string }>({});

  const load = async () => {
    if (!profile) return;
    const [{ data: cats }, { data: prods }, { data: ois }] = await Promise.all([
      supabase.from('categories').select('id, name').eq('company_id', profile.company_id).eq('status', 'ativo').order('sort_order'),
      supabase.from('products').select('id, name, price, sends_to_kitchen, category_id').eq('company_id', profile.company_id).eq('status', 'ativo').order('name'),
      supabase.from('order_items').select('id, product_name, quantity, unit_price, total_price, notes, kitchen_status, sends_to_kitchen, order_item_options(option_group_name, option_item_name)').eq('order_id', orderId).order('created_at'),
    ]);
    setCategories(cats ?? []);
    setProducts((prods ?? []).map((p: any) => ({ ...p, price: Number(p.price) })));
    setItems((ois ?? []).map((o: any) => ({
      ...o,
      unit_price: Number(o.unit_price),
      total_price: Number(o.total_price),
      options: o.order_item_options ?? [],
    })));
  };

  useEffect(() => { if (open) load(); }, [open, orderId]);

  useEffect(() => {
    if (!open || !profile) return;
    (async () => {
      const { data: comp } = await supabase.from('companies').select('name, trade_name, logo_url').eq('id', profile.company_id).maybeSingle();
      setBrand({ name: comp?.name || undefined, tradeName: comp?.trade_name || undefined, logoUrl: comp?.logo_url || undefined });
    })();
  }, [open, profile?.company_id]);

  useEffect(() => {
    if (!open || !profile) return;
    const ch = supabase.channel(`co:${profile.company_id}:order-${orderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `order_id=eq.${orderId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [open, orderId, profile?.company_id]);

  const filtered = useMemo(
    () => activeCat === 'all' ? products : products.filter((p) => p.category_id === activeCat),
    [products, activeCat]
  );

  const subtotal = items.reduce((s, i) => s + (i.kitchen_status === 'cancelado' ? 0 : i.total_price), 0);

  const recalcOrder = async () => {
    const { data } = await supabase.from('order_items').select('total_price, kitchen_status').eq('order_id', orderId);
    const sub = (data ?? []).reduce((s, i: any) => s + (i.kitchen_status === 'cancelado' ? 0 : Number(i.total_price)), 0);
    await supabase.from('orders').update({ subtotal: sub, service_fee_amount: 0, total: sub }).eq('id', orderId);
  };

  const cancelItem = async (it: OrderItem) => {
    // Se ainda não foi enviado para a cozinha, remove. Caso contrário, marca como cancelado.
    if (it.kitchen_status === 'pendente' || !it.sends_to_kitchen && it.kitchen_status === 'entregue' && !it.id) {
      // pure pending → delete
    }
    if (it.kitchen_status === 'pendente') {
      await supabase.from('order_items').delete().eq('id', it.id);
    } else {
      await supabase.from('order_items').update({
        kitchen_status: 'cancelado', canceled_at: new Date().toISOString(),
      }).eq('id', it.id);
    }
    await recalcOrder();
    toast.success('Item cancelado');
    setConfirmCancelItem(null);
    load();
  };

  const swapItem = (it: OrderItem) => {
    if (it.kitchen_status !== 'pendente') {
      toast.error('Só é possível trocar itens ainda não enviados à cozinha.');
      return;
    }
    setSwapItemId(it.id);
    toast.info('Selecione o novo produto no cardápio');
  };

  const saveNotes = async (newNotes: string) => {
    if (!editingNotes) return;
    await supabase.from('order_items').update({ notes: newNotes || null }).eq('id', editingNotes.id);
    setEditingNotes(null);
    toast.success('Observação atualizada');
    load();
  };

  const cancelOrder = async () => {
    // Deleta itens, opções (cascade via RLS join) e o pedido. Libera a mesa.
    await supabase.from('order_items').delete().eq('order_id', orderId);
    await supabase.from('orders').delete().eq('id', orderId);
    await supabase.from('tables').update({ status: 'livre' }).eq('id', tableId);
    toast.success('Pedido cancelado');
    setConfirmCancelOrder(false);
    onOpenChange(false);
  };

  const sendToKitchen = async () => {
    const pending = items.filter((i) => i.sends_to_kitchen && i.kitchen_status === 'pendente');
    if (!pending.length) {
      toast.info('Nenhum item novo aguardando envio para a cozinha.');
      return;
    }
    await supabase.from('order_items').update({
      kitchen_status: 'aguardando', sent_to_kitchen_at: new Date().toISOString(),
    }).in('id', pending.map((p) => p.id));
    await supabase.from('tables').update({ status: 'aguardando' }).eq('id', tableId);
    toast.success(`${pending.length} item(ns) enviados para a cozinha.`);
    load();
  };

  const handleAddDone = async (newItemId: string | null) => {
    setAdding(null);
    // Se for uma troca, remove o item original após inserir o novo
    if (swapItemId && newItemId) {
      await supabase.from('order_items').delete().eq('id', swapItemId);
      toast.success('Produto trocado');
    }
    setSwapItemId(null);
    await recalcOrder();
    load();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="border-b border-border px-6 py-4 pr-14">
          <SheetTitle className="flex items-baseline gap-3">
            <span className="font-display text-2xl">{tableName}</span>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              {swapItemId ? 'Trocando produto…' : 'Pedido aberto'}
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-hidden grid grid-rows-2 md:grid-rows-none md:grid-cols-[1fr_320px]">
          {/* Cardápio */}
          <div className="min-h-0 overflow-y-auto p-6 border-r border-border">
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
              <CatChip active={activeCat === 'all'} onClick={() => setActiveCat('all')}>Todos</CatChip>
              {categories.map((c) => (
                <CatChip key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)}>{c.name}</CatChip>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setAdding(p)}
                  className="text-left rounded-xl border border-border bg-card p-3 hover:border-accent transition"
                >
                  <div className="text-sm font-medium leading-tight">{p.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{fmtBRL(p.price)}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Lista do pedido */}
          <div className="flex flex-col min-h-0 bg-secondary/40 max-md:border-t max-md:border-border">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {items.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-12">Nenhum item ainda.</div>
              )}
              {items.map((it) => {
                const canceled = it.kitchen_status === 'cancelado';
                return (
                  <div key={it.id} className={cn(
                    'rounded-lg border border-border bg-card p-3',
                    canceled && 'opacity-60',
                  )}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{it.quantity}×</span>
                          <span className={cn('text-sm font-medium truncate', canceled && 'line-through')}>{it.product_name}</span>
                        </div>
                        {it.options.length > 0 && (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {it.options.map((o) => o.option_item_name).join(', ')}
                          </div>
                        )}
                        {it.notes && <div className="mt-1 text-[11px] italic text-muted-foreground">"{it.notes}"</div>}
                        <KitchenBadge status={it.kitchen_status} />
                      </div>
                      <div className="text-right flex flex-col items-end gap-1">
                        <div className={cn('text-sm font-semibold', canceled && 'line-through')}>{fmtBRL(it.total_price)}</div>
                        {!canceled && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-1 rounded hover:bg-muted text-muted-foreground">
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => setEditingNotes(it)}>
                                <Pencil className="h-3.5 w-3.5 mr-2" /> Editar observação
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => swapItem(it)}>
                                <Repeat className="h-3.5 w-3.5 mr-2" /> Trocar produto
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setConfirmCancelItem(it)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Cancelar item
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-border bg-card p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold">{fmtBRL(subtotal)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={sendToKitchen} className="bg-primary hover:bg-primary/90">
                  <Send className="h-4 w-4 mr-2" /> Cozinha
                </Button>
                <Button
                  variant="outline"
                  onClick={() => printThermal({
                    title: tableName,
                    subtitle: 'Comanda',
                    brand,
                    items: items.filter((i) => i.kitchen_status !== 'cancelado').map((i) => ({
                      quantity: i.quantity, product_name: i.product_name,
                      total_price: i.total_price, notes: i.notes, options: i.options,
                    })),
                  })}
                >
                  <Printer className="h-4 w-4 mr-2" /> Imprimir
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmCancelOrder(true)}
                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 mt-1"
              >
                <Ban className="h-4 w-4 mr-2" /> Cancelar pedido
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>

      {adding && (
        <AddProductDialog
          product={adding}
          orderId={orderId}
          isSwap={!!swapItemId}
          onDone={handleAddDone}
          onClose={() => { setAdding(null); setSwapItemId(null); }}
        />
      )}

      {editingNotes && (
        <EditNotesDialog
          initial={editingNotes.notes ?? ''}
          productName={editingNotes.product_name}
          onSave={saveNotes}
          onClose={() => setEditingNotes(null)}
        />
      )}

      <AlertDialog open={confirmCancelOrder} onOpenChange={setConfirmCancelOrder}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os itens deste pedido serão removidos e a mesa <strong>{tableName}</strong> ficará livre. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter pedido</AlertDialogCancel>
            <AlertDialogAction onClick={cancelOrder} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sim, cancelar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmCancelItem} onOpenChange={(o) => !o && setConfirmCancelItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar item?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmCancelItem?.kitchen_status === 'pendente'
                ? `O item "${confirmCancelItem?.product_name}" será removido do pedido.`
                : `O item "${confirmCancelItem?.product_name}" já foi enviado à cozinha. Ele será marcado como cancelado e não será cobrado.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmCancelItem && cancelItem(confirmCancelItem)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancelar item
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

function CatChip({ active, onClick, children }: any) {
  return (
    <button onClick={onClick}
      className={cn(
        'whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium border transition',
        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-foreground/40',
      )}>
      {children}
    </button>
  );
}

function KitchenBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    pendente: { label: 'Não enviado', cls: 'bg-muted text-muted-foreground' },
    aguardando: { label: 'Na cozinha', cls: 'bg-warning/20 text-warning-foreground' },
    preparo: { label: 'Em preparo', cls: 'bg-accent/20 text-accent-foreground' },
    pronto: { label: 'Pronto', cls: 'bg-success/20 text-success-foreground' },
    entregue: { label: 'Entregue', cls: 'bg-success text-success-foreground' },
    cancelado: { label: 'Cancelado', cls: 'bg-destructive/15 text-destructive' },
  };
  const c = cfg[status] ?? cfg.pendente;
  return <span className={cn('mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider', c.cls)}>{c.label}</span>;
}

function EditNotesDialog({ initial, productName, onSave, onClose }: { initial: string; productName: string; onSave: (v: string) => void; onClose: () => void }) {
  const [val, setVal] = useState(initial);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Observação</DialogTitle>
          <DialogDescription>{productName}</DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="edit-notes">Detalhes para a cozinha</Label>
          <Textarea id="edit-notes" rows={4} value={val} onChange={(e) => setVal(e.target.value)} placeholder="Ex: bem passado, sem cebola…" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave(val)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddProductDialog({ product, orderId, isSwap, onDone, onClose }: { product: Product; orderId: string; isSwap: boolean; onDone: (newItemId: string | null) => void; onClose: () => void }) {
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const [picks, setPicks] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('product_option_groups')
        .select('sort_order, option_groups(id, name, required, selection_type, max_options, option_items(id, name, additional_price))')
        .eq('product_id', product.id)
        .order('sort_order');
      const gs: OptionGroup[] = (data ?? [])
        .map((row: any) => row.option_groups)
        .filter(Boolean)
        .map((g: any) => ({
          id: g.id, name: g.name, required: g.required, selection_type: g.selection_type, max_options: g.max_options,
          items: (g.option_items ?? []).map((i: any) => ({ ...i, additional_price: Number(i.additional_price) })),
        }));
      setGroups(gs);
      setLoading(false);
    })();
  }, [product.id]);

  const togglePick = (groupId: string, itemId: string, type: 'unica' | 'multipla', max: number | null) => {
    setPicks((prev) => {
      const cur = new Set(prev[groupId] ?? []);
      if (type === 'unica') {
        cur.clear();
        cur.add(itemId);
      } else {
        if (cur.has(itemId)) cur.delete(itemId);
        else if (!max || cur.size < max) cur.add(itemId);
      }
      return { ...prev, [groupId]: cur };
    });
  };

  const extra = groups.reduce((s, g) => {
    const set = picks[g.id];
    if (!set) return s;
    return s + g.items.filter((i) => set.has(i.id)).reduce((a, i) => a + i.additional_price, 0);
  }, 0);
  const total = (product.price + extra) * qty;

  const submit = async () => {
    for (const g of groups) {
      if (g.required && !(picks[g.id]?.size)) { toast.error(`Selecione ${g.name}`); return; }
    }
    const unit = product.price + extra;
    const now = new Date().toISOString();
    const { data: oi, error } = await supabase.from('order_items').insert({
      order_id: orderId, product_id: product.id, product_name: product.name,
      quantity: qty, unit_price: unit, total_price: unit * qty, notes: notes || null,
      sends_to_kitchen: product.sends_to_kitchen,
      kitchen_status: product.sends_to_kitchen ? 'pendente' : 'entregue',
      delivered_at: product.sends_to_kitchen ? null : now,
    }).select('id').single();
    if (error) { toast.error(error.message); return; }
    const opts: any[] = [];
    for (const g of groups) {
      const set = picks[g.id]; if (!set) continue;
      for (const it of g.items) {
        if (set.has(it.id)) opts.push({
          order_item_id: oi.id, option_group_name: g.name, option_item_name: it.name, additional_price: it.additional_price,
        });
      }
    }
    if (opts.length) await supabase.from('order_item_options').insert(opts);
    toast.success(isSwap ? `${product.name} substituído` : `${product.name} adicionado`);
    onDone(oi.id);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isSwap ? `Trocar por: ${product.name}` : product.name}</DialogTitle>
        </DialogHeader>
        {loading ? <div className="text-sm text-muted-foreground">Carregando…</div> : (
          <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
            {groups.map((g) => (
              <div key={g.id}>
                <div className="flex items-baseline justify-between">
                  <h4 className="text-sm font-semibold">{g.name}</h4>
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {g.selection_type === 'unica' ? 'Escolha uma' : `Até ${g.max_options ?? g.items.length}`} {g.required && '· obrigatório'}
                  </span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {g.items.map((i) => {
                    const checked = picks[g.id]?.has(i.id) ?? false;
                    return (
                      <button key={i.id} type="button"
                        onClick={() => togglePick(g.id, i.id, g.selection_type, g.max_options)}
                        className={cn(
                          'w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm transition',
                          checked ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-foreground/30',
                        )}>
                        <span>{i.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {i.additional_price > 0 ? `+ ${fmtBRL(i.additional_price)}` : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div>
              <Label htmlFor="notes">Observação</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: bem passado, sem cebola…" rows={2} />
            </div>
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-3 rounded-full border border-border bg-card px-2 py-1">
                <button onClick={() => setQty(Math.max(1, qty - 1))} className="grid h-7 w-7 place-items-center rounded-full hover:bg-muted"><Minus className="h-3.5 w-3.5" /></button>
                <span className="w-6 text-center text-sm font-semibold">{qty}</span>
                <button onClick={() => setQty(qty + 1)} className="grid h-7 w-7 place-items-center rounded-full hover:bg-muted"><Plus className="h-3.5 w-3.5" /></button>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
                <div className="font-display text-2xl">{fmtBRL(total)}</div>
              </div>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}><X className="h-4 w-4 mr-1" /> Cancelar</Button>
          <Button onClick={submit} className="bg-primary">
            <Plus className="h-4 w-4 mr-1" /> {isSwap ? 'Substituir' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
