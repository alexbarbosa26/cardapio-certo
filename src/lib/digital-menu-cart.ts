import { supabase } from '@/integrations/supabase/client';

export interface CartItem {
  item_id: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  image_url?: string | null;
}

const key = (slug: string) => `mc:cart:${slug}`;

export function loadCart(slug: string): CartItem[] {
  try {
    const raw = localStorage.getItem(key(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCart(slug: string, items: CartItem[]) {
  localStorage.setItem(key(slug), JSON.stringify(items));
}

export function clearCart(slug: string) {
  localStorage.removeItem(key(slug));
}

export const cartSubtotal = (items: CartItem[]) =>
  items.reduce((s, i) => s + i.price * i.quantity, 0);

export const cartCount = (items: CartItem[]) =>
  items.reduce((s, i) => s + i.quantity, 0);

export type ServiceMode = 'delivery' | 'pickup';
export type PaymentMethod = 'dinheiro' | 'pix' | 'cartao_credito' | 'cartao_debito';

export interface Address {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city?: string;
  reference?: string;
}

export interface SubmitOrderInput {
  slug: string;
  client_token: string;
  service_mode: ServiceMode;
  customer_name: string;
  customer_phone: string;
  address: Address | null;
  payment_method: PaymentMethod;
  change_for?: number | null;
  customer_notes?: string;
  items: Array<{ item_id: string; quantity: number; notes?: string }>;
}

export interface SubmitOrderResult {
  order_id: string;
  public_token: string;
  order_number: number;
  status: string;
  duplicate?: boolean;
}

const ORDER_ERRORS: Record<string, string> = {
  invalid_slug: 'Cardápio inválido.',
  invalid_client_token: 'Sessão inválida, recarregue a página.',
  invalid_service_mode: 'Modo de entrega inválido.',
  invalid_customer_name: 'Informe seu nome.',
  invalid_phone: 'Informe um telefone válido.',
  invalid_payment_method: 'Selecione uma forma de pagamento.',
  invalid_address: 'Preencha o endereço de entrega completo.',
  empty_cart: 'Seu carrinho está vazio.',
  company_not_found: 'Estabelecimento não encontrado.',
  menu_unavailable: 'Cardápio indisponível no momento.',
  not_accepting_orders: 'Este estabelecimento não está aceitando pedidos agora.',
  delivery_disabled: 'Entrega não disponível neste estabelecimento.',
  pickup_disabled: 'Retirada não disponível neste estabelecimento.',
  closed_now: 'O estabelecimento está fechado neste horário.',
  below_minimum: 'Pedido abaixo do valor mínimo.',
  item_unavailable: 'Um dos itens do seu carrinho ficou indisponível.',
};

export async function submitPublicOrder(input: SubmitOrderInput): Promise<SubmitOrderResult> {
  const { data, error } = await supabase.rpc('create_public_order', {
    _slug: input.slug.toLowerCase(),
    _client_token: input.client_token,
    _service_mode: input.service_mode,
    _customer_name: input.customer_name,
    _customer_phone: input.customer_phone,
    _address: (input.address ?? null) as unknown as never,
    _payment_method: input.payment_method,
    _change_for: input.change_for ?? null,
    _customer_notes: input.customer_notes ?? null,
    _items: input.items as unknown as never,
  });
  if (error) {
    const code = (error.message || '').match(/[a-z_]+/g)?.find((k) => k in ORDER_ERRORS);
    throw new Error(code ? ORDER_ERRORS[code] : 'Não foi possível enviar o pedido. Tente novamente.');
  }
  return data as unknown as SubmitOrderResult;
}

export async function fetchPublicOrder(token: string) {
  const { data, error } = await supabase.rpc('get_public_order', { _token: token });
  if (error) throw error;
  return data as unknown as {
    found: boolean;
    order?: {
      id: string;
      order_number: number;
      status: string;
      service_mode: string;
      customer_name: string;
      customer_phone: string;
      delivery_address: Address | null;
      payment_method: string;
      change_for: number | null;
      customer_notes: string | null;
      subtotal: number;
      delivery_fee: number;
      total: number;
      opened_at: string;
      items: Array<{ name: string; quantity: number; unit_price: number; total_price: number; notes: string | null; kitchen_status: string }>;
    };
    company?: { name: string; slug: string; logo_url: string | null; primary_color: string | null };
  };
}

export function newClientToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
};
