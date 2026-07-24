import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchPublicMenu, computeOpenStatus, type PublicMenuResponse } from '@/lib/digital-menu';
import {
  loadCart, saveCart, clearCart, cartSubtotal, cartCount,
  submitPublicOrder, newClientToken, PAYMENT_LABELS,
  type CartItem, type ServiceMode, type PaymentMethod, type Address,
} from '@/lib/digital-menu-cart';
import { fmtBRL } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import {
  Search, Clock, MapPin, Phone, Instagram, Plus, Minus, ShoppingBag, Trash2, ArrowLeft, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

export default function CardapioPublico() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ['public-menu', slug],
    queryFn: () => fetchPublicMenu(slug),
    staleTime: 30_000,
  });
  const [q, setQ] = useState('');
  const [cart, setCart] = useState<CartItem[]>(() => loadCart(slug));
  const [cartOpen, setCartOpen] = useState(false);
  const [step, setStep] = useState<'cart' | 'checkout'>('cart');
  const status = useMemo(() => computeOpenStatus(data?.hours), [data]);

  useEffect(() => { setCart(loadCart(slug)); }, [slug]);
  useEffect(() => { saveCart(slug, cart); }, [slug, cart]);
  useEffect(() => { if (data?.company?.name) document.title = `${data.company.name} · Cardápio`; }, [data]);
  useEffect(() => {
    const primary = data?.company?.primary_color;
    if (!primary) return;
    document.documentElement.style.setProperty('--menu-brand', primary);
    return () => { document.documentElement.style.removeProperty('--menu-brand'); };
  }, [data]);

  if (isLoading) return <div className="min-h-screen bg-neutral-50 grid place-items-center text-neutral-500">Carregando cardápio…</div>;
  if (error || !data?.found) return <FullMessage title="Cardápio não encontrado" msg="Verifique o link e tente novamente." />;
  if (!data.available) return <FullMessage title="Cardápio indisponível" msg="Este estabelecimento não está disponibilizando o cardápio digital no momento." logo={data.company?.logo_url ?? null} />;

  const filtered = filterMenu(data, q);
  const brand = data.company?.primary_color ?? '#111827';
  const settings = data.settings ?? {};
  const canOrder = status.open && settings.accepting_orders !== false && (settings.delivery_enabled || settings.pickup_enabled);

  const addItem = (item: { id: string; name: string; price: number; image_url: string | null }) => {
    setCart((prev) => {
      const idx = prev.findIndex((p) => p.item_id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { item_id: item.id, name: item.name, price: item.price, image_url: item.image_url, quantity: 1 }];
    });
    toast.success(`${item.name} adicionado`, { duration: 1500 });
  };

  const changeQty = (item_id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((p) => (p.item_id === item_id ? { ...p, quantity: p.quantity + delta } : p))
        .filter((p) => p.quantity > 0),
    );
  };
  const removeItem = (item_id: string) => setCart((prev) => prev.filter((p) => p.item_id !== item_id));

  const subtotal = cartSubtotal(cart);
  const count = cartCount(cart);
  const openCart = () => { setStep('cart'); setCartOpen(true); };
  const onOrderPlaced = (token: string) => {
    clearCart(slug);
    setCart([]);
    setCartOpen(false);
    navigate(`/cardapio/${slug}/pedido/${token}`);
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <MenuHeader data={data} status={status} brand={brand} />

      <div className="mx-auto max-w-3xl px-4 pb-28">
        <div className="sticky top-0 z-20 -mx-4 bg-neutral-50/95 px-4 py-3 backdrop-blur border-b border-neutral-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar no cardápio…"
              className="pl-9 h-11 bg-white border-neutral-200"
            />
          </div>
          {filtered.length > 0 && (
            <nav className="mt-3 flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1">
              {filtered.map((c) => (
                <a key={c.id} href={`#cat-${c.id}`}
                   className="whitespace-nowrap rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:border-neutral-400">
                  {c.name}
                </a>
              ))}
            </nav>
          )}
        </div>

        {!canOrder && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {status.open
              ? 'No momento este estabelecimento não está aceitando pedidos.'
              : `Fechado agora. ${status.next ? `Abrimos ${status.next}.` : 'Sem horário previsto de abertura.'}`}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="mt-16 text-center text-neutral-500">Nenhum item encontrado.</div>
        ) : (
          filtered.map((c) => (
            <section key={c.id} id={`cat-${c.id}`} className="mt-8 scroll-mt-32">
              <h2 className="text-lg font-semibold tracking-tight">{c.name}</h2>
              {c.description && <p className="text-sm text-neutral-500 mt-0.5">{c.description}</p>}
              <ul className="mt-3 divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
                {c.items.map((it) => {
                  const inCart = cart.find((p) => p.item_id === it.id)?.quantity ?? 0;
                  const disabled = it.sold_out || !canOrder;
                  return (
                    <li key={it.id} className={`flex gap-3 p-3 ${it.sold_out ? 'opacity-60' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <h3 className="font-medium leading-tight">{it.name}</h3>
                          {it.featured && !it.sold_out && (
                            <span className="text-[10px] uppercase tracking-wider text-white rounded px-1.5 py-0.5"
                                  style={{ background: brand }}>Destaque</span>
                          )}
                        </div>
                        {it.description && <p className="mt-1 text-sm text-neutral-600 line-clamp-2">{it.description}</p>}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold" style={{ color: brand }}>{fmtBRL(it.price)}</span>
                          {it.sold_out ? (
                            <span className="text-[11px] text-neutral-500 uppercase tracking-wider">Esgotado</span>
                          ) : inCart > 0 ? (
                            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-1 py-0.5">
                              <button aria-label="Diminuir" onClick={() => changeQty(it.id, -1)} className="h-7 w-7 grid place-items-center rounded-full hover:bg-neutral-100"><Minus className="h-3.5 w-3.5" /></button>
                              <span className="min-w-4 text-center text-sm font-medium tabular-nums">{inCart}</span>
                              <button aria-label="Aumentar" onClick={() => changeQty(it.id, 1)} className="h-7 w-7 grid place-items-center rounded-full hover:bg-neutral-100"><Plus className="h-3.5 w-3.5" /></button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => addItem(it)}
                              className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-40"
                              style={{ background: brand }}
                            >
                              <Plus className="h-3.5 w-3.5" /> Adicionar
                            </button>
                          )}
                        </div>
                      </div>
                      {it.image_url && (
                        <img src={it.image_url} alt={it.name} loading="lazy"
                             className="h-20 w-20 flex-shrink-0 rounded-lg object-cover bg-neutral-100" />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}

        <footer className="mt-16 text-center text-xs text-neutral-400">
          Powered by <Link to="/" className="underline">MesaChef</Link>
        </footer>
      </div>

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 backdrop-blur px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <div className="text-sm">
              <div className="text-neutral-500">{count} {count === 1 ? 'item' : 'itens'}</div>
              <div className="font-semibold">{fmtBRL(subtotal)}</div>
            </div>
            <Button onClick={openCart} className="h-11 gap-2" style={{ background: brand }}>
              <ShoppingBag className="h-4 w-4" /> Ver carrinho
            </Button>
          </div>
        </div>
      )}

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
          {step === 'cart' ? (
            <CartView
              cart={cart} brand={brand} subtotal={subtotal}
              deliveryFee={settings.delivery_fee ?? 0}
              minOrder={settings.min_order_amount ?? 0}
              onChangeQty={changeQty} onRemove={removeItem}
              onCheckout={() => setStep('checkout')}
            />
          ) : (
            <CheckoutView
              slug={slug} cart={cart} subtotal={subtotal} brand={brand}
              settings={settings}
              onBack={() => setStep('cart')}
              onDone={onOrderPlaced}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CartView({
  cart, brand, subtotal, deliveryFee, minOrder, onChangeQty, onRemove, onCheckout,
}: {
  cart: CartItem[]; brand: string; subtotal: number; deliveryFee: number; minOrder: number;
  onChangeQty: (id: string, delta: number) => void; onRemove: (id: string) => void; onCheckout: () => void;
}) {
  const belowMin = minOrder > 0 && subtotal < minOrder;
  return (
    <>
      <SheetHeader className="border-b px-5 py-4"><SheetTitle>Seu pedido</SheetTitle></SheetHeader>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {cart.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-neutral-500">Carrinho vazio.</div>
        ) : (
          <ul className="space-y-3">
            {cart.map((it) => (
              <li key={it.item_id} className="flex gap-3 rounded-lg border border-neutral-200 p-3">
                {it.image_url && <img src={it.image_url} alt="" className="h-14 w-14 rounded-md object-cover" />}
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{it.name}</div>
                      <div className="text-xs text-neutral-500">{fmtBRL(it.price)}</div>
                    </div>
                    <button onClick={() => onRemove(it.item_id)} aria-label="Remover" className="text-neutral-400 hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-1 py-0.5">
                      <button onClick={() => onChangeQty(it.item_id, -1)} className="h-7 w-7 grid place-items-center rounded-full hover:bg-neutral-100" aria-label="Diminuir"><Minus className="h-3.5 w-3.5" /></button>
                      <span className="min-w-4 text-center text-sm font-medium tabular-nums">{it.quantity}</span>
                      <button onClick={() => onChangeQty(it.item_id, 1)} className="h-7 w-7 grid place-items-center rounded-full hover:bg-neutral-100" aria-label="Aumentar"><Plus className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="text-sm font-semibold">{fmtBRL(it.price * it.quantity)}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <SheetFooter className="border-t px-5 py-4 sm:flex-col sm:items-stretch sm:space-x-0">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-neutral-600"><span>Subtotal</span><span>{fmtBRL(subtotal)}</span></div>
          {deliveryFee > 0 && <div className="flex justify-between text-neutral-600"><span>Taxa de entrega (delivery)</span><span>{fmtBRL(deliveryFee)}</span></div>}
          {belowMin && <div className="text-xs text-destructive">Pedido mínimo: {fmtBRL(minOrder)}</div>}
        </div>
        <Button
          className="mt-3 h-12 w-full"
          disabled={cart.length === 0 || belowMin}
          onClick={onCheckout}
          style={{ background: brand }}
        >
          Continuar
        </Button>
      </SheetFooter>
    </>
  );
}

function CheckoutView({
  slug, cart, subtotal, brand, settings, onBack, onDone,
}: {
  slug: string; cart: CartItem[]; subtotal: number; brand: string;
  settings: Partial<{ delivery_fee: number; delivery_enabled: boolean; pickup_enabled: boolean; min_order_amount: number }>;
  onBack: () => void; onDone: (token: string) => void;
}) {
  const canDelivery = settings.delivery_enabled !== false;
  const canPickup = settings.pickup_enabled !== false;
  const [mode, setMode] = useState<ServiceMode>(canDelivery ? 'delivery' : 'pickup');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('pix');
  const [needsChange, setNeedsChange] = useState(false);
  const [changeFor, setChangeFor] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [addr, setAddr] = useState<Address>({ street: '', number: '', complement: '', neighborhood: '', reference: '' });
  const [submitting, setSubmitting] = useState(false);

  const deliveryFee = mode === 'delivery' ? settings.delivery_fee ?? 0 : 0;
  const total = subtotal + deliveryFee;

  const submit = async () => {
    if (!name.trim() || name.trim().length < 2) return toast.error('Informe seu nome.');
    if (phone.replace(/\D/g, '').length < 10) return toast.error('Informe um telefone válido com DDD.');
    if (mode === 'delivery') {
      if (!addr.street || !addr.number || !addr.neighborhood) return toast.error('Preencha rua, número e bairro.');
    }
    let change: number | null = null;
    if (payment === 'dinheiro' && needsChange) {
      change = Number(changeFor.replace(',', '.'));
      if (!Number.isFinite(change) || change <= total) return toast.error('O troco deve ser maior que o total.');
    }
    setSubmitting(true);
    try {
      const res = await submitPublicOrder({
        slug,
        client_token: newClientToken(),
        service_mode: mode,
        customer_name: name.trim(),
        customer_phone: phone,
        address: mode === 'delivery' ? addr : null,
        payment_method: payment,
        change_for: change,
        customer_notes: notes,
        items: cart.map((c) => ({ item_id: c.item_id, quantity: c.quantity, notes: c.notes })),
      });
      onDone(res.public_token);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <SheetHeader className="flex-row items-center gap-2 border-b px-5 py-4 space-y-0">
        <button onClick={onBack} aria-label="Voltar" className="h-8 w-8 grid place-items-center rounded-full hover:bg-neutral-100"><ArrowLeft className="h-4 w-4" /></button>
        <SheetTitle>Finalizar pedido</SheetTitle>
      </SheetHeader>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {canDelivery && canPickup && (
          <div>
            <Label className="text-xs uppercase text-neutral-500">Modo</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as ServiceMode)} className="mt-2 grid grid-cols-2 gap-2">
              <label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${mode === 'delivery' ? 'border-neutral-900' : 'border-neutral-200'}`}>
                <RadioGroupItem value="delivery" /> Entrega
              </label>
              <label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${mode === 'pickup' ? 'border-neutral-900' : 'border-neutral-200'}`}>
                <RadioGroupItem value="pickup" /> Retirar no local
              </label>
            </RadioGroup>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label htmlFor="cust-name">Nome</Label>
            <Input id="cust-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
          </div>
          <div>
            <Label htmlFor="cust-phone">Telefone (WhatsApp)</Label>
            <Input id="cust-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="(11) 90000-0000" />
          </div>
        </div>

        {mode === 'delivery' && (
          <div className="space-y-3">
            <div className="text-xs uppercase text-neutral-500">Endereço de entrega</div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label htmlFor="addr-street">Rua</Label>
                <Input id="addr-street" value={addr.street} onChange={(e) => setAddr({ ...addr, street: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="addr-number">Número</Label>
                <Input id="addr-number" value={addr.number} onChange={(e) => setAddr({ ...addr, number: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="addr-neighborhood">Bairro</Label>
                <Input id="addr-neighborhood" value={addr.neighborhood} onChange={(e) => setAddr({ ...addr, neighborhood: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="addr-complement">Complemento</Label>
                <Input id="addr-complement" value={addr.complement ?? ''} onChange={(e) => setAddr({ ...addr, complement: e.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="addr-reference">Ponto de referência</Label>
              <Input id="addr-reference" value={addr.reference ?? ''} onChange={(e) => setAddr({ ...addr, reference: e.target.value })} />
            </div>
          </div>
        )}

        <div>
          <Label className="text-xs uppercase text-neutral-500">Forma de pagamento</Label>
          <RadioGroup value={payment} onValueChange={(v) => { setPayment(v as PaymentMethod); if (v !== 'dinheiro') setNeedsChange(false); }} className="mt-2 space-y-2">
            {(['pix', 'dinheiro', 'cartao_credito', 'cartao_debito'] as PaymentMethod[]).map((m) => (
              <label key={m} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${payment === m ? 'border-neutral-900' : 'border-neutral-200'}`}>
                <RadioGroupItem value={m} /> {PAYMENT_LABELS[m]}
              </label>
            ))}
          </RadioGroup>
          {payment === 'dinheiro' && (
            <div className="mt-3 space-y-2 rounded-lg bg-neutral-100 p-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={needsChange} onChange={(e) => setNeedsChange(e.target.checked)} /> Preciso de troco
              </label>
              {needsChange && (
                <div>
                  <Label htmlFor="change-for" className="text-xs">Troco para</Label>
                  <Input id="change-for" value={changeFor} onChange={(e) => setChangeFor(e.target.value)} inputMode="decimal" placeholder="ex: 100" />
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="cust-notes">Observações do pedido</Label>
          <Textarea id="cust-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Ex.: sem cebola, ponto da carne..." />
        </div>

        <Separator />
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-neutral-600">Subtotal</span><span>{fmtBRL(subtotal)}</span></div>
          {deliveryFee > 0 && <div className="flex justify-between"><span className="text-neutral-600">Taxa de entrega</span><span>{fmtBRL(deliveryFee)}</span></div>}
          <div className="flex justify-between text-base font-semibold pt-1"><span>Total</span><span>{fmtBRL(total)}</span></div>
        </div>
      </div>
      <SheetFooter className="border-t px-5 py-4 sm:flex-col sm:items-stretch sm:space-x-0">
        <Button onClick={submit} disabled={submitting} className="h-12 w-full" style={{ background: brand }}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : `Confirmar pedido · ${fmtBRL(total)}`}
        </Button>
      </SheetFooter>
    </>
  );
}

function MenuHeader({ data, status, brand }: {
  data: PublicMenuResponse; status: { open: boolean; next: string | null }; brand: string;
}) {
  const s = data.settings ?? {};
  const c = data.company!;
  return (
    <header className="relative">
      <div className="h-40 w-full" style={{ background: s.cover_url ? `url(${s.cover_url}) center/cover` : `linear-gradient(180deg, ${brand}, ${brand}dd)` }} />
      <div className="mx-auto max-w-3xl px-4">
        <div className="-mt-10 flex items-end gap-4">
          <div className="h-20 w-20 flex-shrink-0 rounded-2xl border-4 border-neutral-50 bg-white shadow-sm grid place-items-center overflow-hidden">
            {c.logo_url ? (
              <img src={c.logo_url} alt={c.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-neutral-400">{c.name?.[0]}</span>
            )}
          </div>
          <div className="pb-2 min-w-0">
            <h1 className="text-xl font-semibold truncate">{c.name}</h1>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${status.open ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-200 text-neutral-700'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${status.open ? 'bg-emerald-500' : 'bg-neutral-500'}`} />
                {status.open ? 'Aberto agora' : 'Fechado'}
              </span>
              {s.avg_prep_min ? <span className="text-neutral-500 inline-flex items-center gap-1"><Clock className="h-3 w-3" />~{s.avg_prep_min} min</span> : null}
            </div>
          </div>
        </div>

        {s.presentation && <p className="mt-4 text-sm text-neutral-700 leading-relaxed">{s.presentation}</p>}

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
          {s.address && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{s.address}</span>}
          {s.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</span>}
          {s.instagram && <a className="inline-flex items-center gap-1 hover:underline" href={`https://instagram.com/${s.instagram.replace('@', '')}`} target="_blank" rel="noreferrer"><Instagram className="h-3 w-3" />@{s.instagram.replace('@', '')}</a>}
        </div>
      </div>
    </header>
  );
}

function FullMessage({ title, msg, logo }: { title: string; msg: string; logo?: string | null }) {
  return (
    <div className="min-h-screen bg-neutral-50 grid place-items-center px-6">
      <div className="text-center max-w-sm">
        {logo && <img src={logo} className="mx-auto mb-4 h-16 w-16 rounded-xl object-cover" alt="" />}
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-neutral-600">{msg}</p>
      </div>
    </div>
  );
}

function filterMenu(data: PublicMenuResponse, q: string) {
  const cats = data.categories ?? [];
  const query = q.trim().toLowerCase();
  if (!query) return cats;
  return cats
    .map((c) => ({ ...c, items: c.items.filter((i) => i.name.toLowerCase().includes(query) || (i.description ?? '').toLowerCase().includes(query)) }))
    .filter((c) => c.items.length > 0);
}
