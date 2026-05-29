import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Printer, Plus, Trash2, Scale, Pencil, Receipt } from 'lucide-react';
import { fmtBRL } from '@/lib/format';
import { printThermal } from '@/lib/print-order';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CheckoutTabDialog } from './checkout-tab-dialog';

interface Props {
  tabId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

interface Product {
  id: string; name: string; price: number; category_id: string | null;
  is_weighted: boolean; price_per_kg: number;
}
interface Category { id: string; name: string; }
interface TabItem {
  id: string; product_name: string; quantity: number; unit_price: number;
  total_price: number; item_type: 'fixo' | 'peso' | 'manual';
  weight_grams: number | null; notes: string | null;
  category_name: string | null;
}
interface TabRow {
  id: string; company_id: string; tab_number: number; customer_name: string | null;
  status: string; subtotal: number; total: number; paid_amount: number;
  service_fee_amount: number; service_fee_percentage: number; discount: number;
  notes: string | null;
}

export function ComandaSheet({ tabId, open, onOpenChange }: Props) {
  const { profile } = useAuth();
  const [tab, setTab] = useState<TabRow | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<TabItem[]>([]);
  const [activeCat, setActiveCat] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState<Product | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [editName, setEditName] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [brand, setBrand] = useState<{ name?: string; tradeName?: string; logoUrl?: string }>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const load = async () => {
    if (!profile) return;
    const { data: t } = await supabase.from('customer_tabs').select('*').eq('id', tabId).single();
    if (!t) return;
    setTab({
      ...t,
      subtotal: Number(t.subtotal), total: Number(t.total), paid_amount: Number(t.paid_amount),
      service_fee_amount: Number(t.service_fee_amount),
      service_fee_percentage: Number(t.service_fee_percentage),
      discount: Number(t.discount),
    } as TabRow);
    setCustomerName(t.customer_name ?? '');
    const [{ data: cats }, { data: prods }, { data: its }, { data: comp }] = await Promise.all([
      supabase.from('categories').select('id, name').eq('company_id', profile.company_id).eq('status', 'ativo').order('sort_order'),
      supabase.from('products').select('id, name, price, category_id, is_weighted, price_per_kg').eq('company_id', profile.company_id).eq('status', 'ativo').order('name'),
      supabase.from('tab_items').select('*').eq('tab_id', tabId).is('canceled_at', null).order('created_at'),
      supabase.from('companies').select('name, trade_name, logo_url').eq('id', profile.company_id).maybeSingle(),
    ]);
    setCategories(cats ?? []);
    setProducts((prods ?? []).map((p: any) => ({ ...p, price: Number(p.price), price_per_kg: Number(p.price_per_kg ?? 0) })));
    setItems((its ?? []).map((i: any) => ({
      ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price),
      total_price: Number(i.total_price), weight_grams: i.weight_grams != null ? Number(i.weight_grams) : null,
    })));
    setBrand({ name: comp?.name || undefined, tradeName: comp?.trade_name || undefined, logoUrl: comp?.logo_url || undefined });
  };

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, tabId]);

  useEffect(() => {
    if (!open || !profile) return;
    const ch = supabase.channel(`co:${profile.company_id}:tab-${tabId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_items', filter: `tab_id=eq.${tabId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_tabs', filter: `id=eq.${tabId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [open, tabId, profile?.company_id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (activeCat !== 'all' && p.category_id !== activeCat) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, activeCat, search]);

  const removeItem = async (id: string) => {
    await supabase.from('tab_items').delete().eq('id', id);
    toast.success('Item removido');
  };

  const saveCustomerName = async () => {
    await supabase.from('customer_tabs').update({ customer_name: customerName || null }).eq('id', tabId);
    setEditName(false);
    toast.success('Nome atualizado');
  };

  if (!tab) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0">
          <div className="p-8 text-sm text-muted-foreground">Carregando…</div>
        </SheetContent>
      </Sheet>
    );
  }

  const canEdit = tab.status === 'aberta';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="border-b border-border px-6 py-4 pr-14">
          <SheetTitle className="flex items-baseline gap-3 flex-wrap">
            <span className="font-display text-2xl">Comanda #{tab.tab_number}</span>
            {editName ? (
              <div className="flex items-center gap-1">
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                  className="h-7 w-44" placeholder="Cliente" />
                <Button size="sm" onClick={saveCustomerName}>OK</Button>
              </div>
            ) : (
              <button onClick={() => setEditName(true)} className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
                {tab.customer_name || '+ adicionar cliente'} <Pencil className="h-3 w-3" />
              </button>
            )}
            <span className="ml-auto text-xs uppercase tracking-wider text-muted-foreground">{tab.status}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-hidden grid md:grid-cols-[1fr_340px]">
          {/* Adição de itens */}
          <div className="overflow-y-auto p-4 border-r border-border space-y-3">
            <Tabs defaultValue="fixo">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="fixo">Fixo</TabsTrigger>
                <TabsTrigger value="peso">Por peso</TabsTrigger>
                <TabsTrigger value="manual">Manual</TabsTrigger>
              </TabsList>

              <TabsContent value="fixo" className="m-0 mt-3">
                <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
                  <Chip active={activeCat === 'all'} onClick={() => setActiveCat('all')}>Todos</Chip>
                  {categories.map((c) => (
                    <Chip key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)}>{c.name}</Chip>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {filtered.filter((p) => !p.is_weighted).map((p) => (
                    <button key={p.id} disabled={!canEdit}
                      onClick={() => setAdding(p)}
                      className="text-left rounded-xl border border-border bg-card p-3 hover:border-accent transition disabled:opacity-50">
                      <div className="text-sm font-medium leading-tight">{p.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{fmtBRL(p.price)}</div>
                    </button>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="peso" className="m-0 mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">Produtos vendidos por kg.</p>
                {products.filter((p) => p.is_weighted).length === 0 && (
                  <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground text-center">
                    Nenhum produto pesável cadastrado. Em <strong>Produtos</strong>, marque a opção "Vendido por peso".
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {products.filter((p) => p.is_weighted).map((p) => (
                    <button key={p.id} disabled={!canEdit} onClick={() => setAdding(p)}
                      className="text-left rounded-xl border border-border bg-card p-3 hover:border-accent transition disabled:opacity-50">
                      <div className="text-sm font-medium leading-tight flex items-center gap-1"><Scale className="h-3 w-3" />{p.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{fmtBRL(p.price_per_kg)}/kg</div>
                    </button>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="manual" className="m-0 mt-3">
                <Button onClick={() => setManualOpen(true)} disabled={!canEdit} className="w-full">
                  <Plus className="h-4 w-4 mr-1" /> Adicionar item manual
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">Use para itens fora do cardápio — nome livre e valor avulso.</p>
              </TabsContent>
            </Tabs>
          </div>

          {/* Lista da comanda */}
          <div className="flex flex-col bg-secondary/40 max-md:border-t max-md:border-border">
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {items.length === 0 && <div className="text-center text-xs text-muted-foreground py-12">Nenhum item ainda.</div>}
              {items.map((it) => (
                <div key={it.id} className="rounded-lg border border-border bg-card p-3 flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{it.product_name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {it.item_type === 'peso' && it.weight_grams
                        ? `${(it.weight_grams/1000).toFixed(3)} kg × ${fmtBRL(it.unit_price)}/kg`
                        : `${it.quantity} × ${fmtBRL(it.unit_price)}`}
                      {it.category_name && ` · ${it.category_name}`}
                    </div>
                    {it.notes && <div className="text-[11px] italic text-muted-foreground mt-0.5">"{it.notes}"</div>}
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <div className="text-sm font-semibold">{fmtBRL(it.total_price)}</div>
                    {canEdit && (
                      <button onClick={() => removeItem(it.id)} className="text-muted-foreground hover:text-destructive p-1">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-border bg-card p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold">{fmtBRL(tab.subtotal)}</span>
              </div>
              {tab.service_fee_amount > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Taxa serviço</span><span>{fmtBRL(tab.service_fee_amount)}</span>
                </div>
              )}
              {tab.discount > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Desconto</span><span>- {fmtBRL(tab.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-display">
                <span>Total</span><span>{fmtBRL(tab.total)}</span>
              </div>
              {tab.paid_amount > 0 && (
                <div className="flex justify-between text-xs text-success">
                  <span>Pago</span><span>{fmtBRL(tab.paid_amount)}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => printThermal({
                  title: `Comanda #${tab.tab_number}`,
                  subtitle: tab.customer_name || undefined,
                  brand,
                  items: items.map((i) => ({
                    quantity: i.quantity,
                    product_name: i.item_type === 'peso' && i.weight_grams
                      ? `${i.product_name} (${(i.weight_grams/1000).toFixed(3)} kg)`
                      : i.product_name,
                    total_price: i.total_price, notes: i.notes,
                  })),
                  totals: [
                    { label: 'Subtotal', value: fmtBRL(tab.subtotal) },
                    ...(tab.service_fee_amount > 0 ? [{ label: 'Taxa serviço', value: fmtBRL(tab.service_fee_amount) }] : []),
                    ...(tab.discount > 0 ? [{ label: 'Desconto', value: `- ${fmtBRL(tab.discount)}` }] : []),
                    { label: 'Total', value: fmtBRL(tab.total), bold: true },
                  ],
                })}>
                  <Printer className="h-4 w-4 mr-1" />Imprimir
                </Button>
                <Button
                  onClick={() => setCheckoutOpen(true)}
                  disabled={items.length === 0 || tab.status === 'paga' || tab.status === 'cancelada'}
                >
                  <Receipt className="h-4 w-4 mr-1" />
                  {tab.status === 'paga' ? 'Finalizada' : tab.status === 'cancelada' ? 'Cancelada' : 'Fechar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>

      {adding && profile && (
        <AddProductDialog
          product={adding} tabId={tabId} companyId={profile.company_id}
          categoryName={categories.find((c) => c.id === adding.category_id)?.name ?? null}
          userId={profile.id}
          onClose={() => setAdding(null)}
          onDone={() => { setAdding(null); load(); }}
        />
      )}

      {manualOpen && profile && (
        <ManualItemDialog
          tabId={tabId} companyId={profile.company_id} userId={profile.id}
          onClose={() => setManualOpen(false)}
          onDone={() => { setManualOpen(false); load(); }}
        />
      )}

      {checkoutOpen && (
        <CheckoutTabDialog
          tabId={tabId} open={checkoutOpen}
          onOpenChange={setCheckoutOpen}
          onFinalized={() => onOpenChange(false)}
        />
      )}
    </Sheet>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn('whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium border transition',
        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-foreground/40')}>
      {children}
    </button>
  );
}

function AddProductDialog({
  product, tabId, companyId, categoryName, userId, onDone, onClose,
}: { product: Product; tabId: string; companyId: string; categoryName: string | null; userId: string; onDone: () => void; onClose: () => void }) {
  const [qty, setQty] = useState(1);
  const [grams, setGrams] = useState('');
  const [notes, setNotes] = useState('');
  const weighted = product.is_weighted;
  const g = Number(grams.replace(',', '.')) || 0;
  const total = weighted ? (g / 1000) * product.price_per_kg : qty * product.price;

  const save = async () => {
    if (weighted && g <= 0) { toast.error('Informe o peso.'); return; }
    if (!weighted && qty <= 0) { toast.error('Quantidade inválida.'); return; }
    const payload: any = {
      company_id: companyId, tab_id: tabId,
      product_id: product.id, product_name: product.name,
      category_name: categoryName,
      item_type: weighted ? 'peso' : 'fixo',
      quantity: weighted ? 1 : qty,
      unit_price: weighted ? product.price_per_kg : product.price,
      price_per_kg: weighted ? product.price_per_kg : null,
      weight_grams: weighted ? g : null,
      total_price: +total.toFixed(2),
      notes: notes || null, created_by: userId,
    };
    const { error } = await supabase.from('tab_items').insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success('Item adicionado');
    onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{product.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {weighted ? (
            <div>
              <Label>Peso (gramas)</Label>
              <Input type="number" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} placeholder="ex: 350" autoFocus />
              <p className="text-xs text-muted-foreground mt-1">{fmtBRL(product.price_per_kg)}/kg</p>
            </div>
          ) : (
            <div>
              <Label>Quantidade</Label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
              <p className="text-xs text-muted-foreground mt-1">{fmtBRL(product.price)} cada</p>
            </div>
          )}
          <div>
            <Label>Observação (opcional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ex: sem açúcar" />
          </div>
          <div className="flex justify-between rounded-lg bg-secondary/50 p-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="font-display text-xl">{fmtBRL(total)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save}>Adicionar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManualItemDialog({
  tabId, companyId, userId, onDone, onClose,
}: { tabId: string; companyId: string; userId: string; onDone: () => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const p = Number(price.replace(',', '.')) || 0;
  const total = p * qty;

  const save = async () => {
    if (!name.trim()) { toast.error('Informe o nome.'); return; }
    if (p <= 0) { toast.error('Valor inválido.'); return; }
    const { error } = await supabase.from('tab_items').insert({
      company_id: companyId, tab_id: tabId,
      product_name: name.trim(), item_type: 'manual',
      quantity: qty, unit_price: p, total_price: +total.toFixed(2),
      notes: notes || null, created_by: userId,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Item adicionado');
    onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Item manual</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome do item</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Couvert" autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Valor unitário (R$)</Label>
              <Input type="number" inputMode="decimal" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
            <div><Label>Quantidade</Label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} /></div>
          </div>
          <div><Label>Observação (opcional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="flex justify-between rounded-lg bg-secondary/50 p-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="font-display text-xl">{fmtBRL(total)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save}>Adicionar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
