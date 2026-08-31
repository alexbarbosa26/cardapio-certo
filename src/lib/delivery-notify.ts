/**
 * Notificações ao cliente do delivery via WhatsApp (link wa.me).
 * Não requer credenciais nem custo: monta a mensagem pronta e abre o WhatsApp.
 */

export type DeliveryStatus =
  | 'aguardando_aceite'
  | 'em_preparo'
  | 'pronto'
  | 'em_entrega'
  | 'entregue'
  | 'recusado'
  | 'cancelado';

export interface NotifyContext {
  order_number: number;
  customer_name?: string | null;
  service_mode: string;
  status: string;
  estimated_minutes?: number | null;
  reason?: string | null;
  driver_name?: string | null;
  track_url?: string | null;
}

const firstName = (n?: string | null) => (n ?? '').trim().split(/\s+/)[0] || 'Olá';

/** Mensagem padrão para cada etapa do pedido. */
export function buildStatusMessage(ctx: NotifyContext): string {
  const hi = `Olá, ${firstName(ctx.customer_name)}!`;
  const ref = `pedido #${ctx.order_number}`;
  const eta = ctx.estimated_minutes ? ` Previsão de aproximadamente ${ctx.estimated_minutes} minutos.` : '';
  const track = ctx.track_url ? `\n\nAcompanhe em tempo real: ${ctx.track_url}` : '';

  let body: string;
  const withDriver = ctx.driver_name ? ` com ${ctx.driver_name}` : '';
  const reason = ctx.reason ? ` Motivo: ${ctx.reason}.` : '';

  switch (ctx.status) {
    case 'em_preparo':
      body = `${hi} Seu ${ref} foi aceito e já está em preparo.${eta}`;
      break;
    case 'pronto':
      body =
        ctx.service_mode === 'delivery'
          ? `${hi} Seu ${ref} está pronto e sairá para entrega em instantes.`
          : `${hi} Seu ${ref} está pronto para retirada. Estamos te esperando!`;
      break;
    case 'em_entrega':
      body = `${hi} Seu ${ref} saiu para entrega${withDriver}. Já está a caminho!`;
      break;
    case 'entregue':
      body =
        ctx.service_mode === 'delivery'
          ? `${hi} Seu ${ref} foi entregue. Bom apetite e obrigado pela preferência!`
          : `${hi} Seu ${ref} foi retirado. Bom apetite e obrigado pela preferência!`;
      break;
    case 'recusado':
      body = `${hi} Infelizmente não conseguimos aceitar o seu ${ref}.${reason} Pedimos desculpas pelo transtorno.`;
      break;
    case 'cancelado':
      body = `${hi} Seu ${ref} foi cancelado.${reason} Qualquer dúvida, estamos à disposição.`;
      break;
    default:
      body = `${hi} Recebemos o seu ${ref} e ele já está na fila de confirmação.`;
  }
  return `${body}${track}`;
}

/** Só faz sentido notificar nestas transições. */
export const NOTIFIABLE = new Set(['em_preparo', 'pronto', 'em_entrega', 'entregue', 'recusado', 'cancelado']);

export function normalizePhone(phone?: string | null): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  // Adiciona DDI do Brasil quando ausente.
  return digits.length <= 11 ? `55${digits}` : digits;
}

export function whatsappLink(phone: string | null | undefined, message: string): string | null {
  const to = normalizePhone(phone);
  if (!to) return null;
  return `https://wa.me/${to}?text=${encodeURIComponent(message)}`;
}

export function publicTrackUrl(slug?: string | null, token?: string | null): string | null {
  if (!slug || !token) return null;
  return `${globalThis.location.origin}/cardapio/${slug}/pedido/${token}`;
}

/** Abre o WhatsApp em nova aba. Retorna false quando o telefone é inválido. */
export function openWhatsapp(phone: string | null | undefined, message: string): boolean {
  const url = whatsappLink(phone, message);
  if (!url) return false;
  globalThis.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

/* ------------------------- ETA dinâmico ------------------------- */

export interface EtaSource {
  status: string;
  service_mode: string;
  opened_at: string;
  accepted_at?: string | null;
  ready_at?: string | null;
  dispatched_at?: string | null;
  delivered_at?: string | null;
  estimated_minutes?: number | null;
}

/** Minutos estimados do trajeto de entrega após sair da loja. */
export const DELIVERY_LEG_MIN = 15;

/**
 * Recalcula a previsão usando os marcos reais já registrados no pedido.
 * Cada avanço de status reancora o cálculo no horário efetivo da etapa.
 */
export function computeEtaTarget(o: EtaSource): { target: number; anchor: string } | null {
  const prep = o.estimated_minutes && o.estimated_minutes > 0 ? o.estimated_minutes : 30;
  const leg = o.service_mode === 'delivery' ? DELIVERY_LEG_MIN : 0;

  if (o.status === 'em_entrega' && o.dispatched_at) {
    return { target: new Date(o.dispatched_at).getTime() + DELIVERY_LEG_MIN * 60_000, anchor: 'dispatched' };
  }
  if (o.status === 'pronto' && o.ready_at) {
    return { target: new Date(o.ready_at).getTime() + leg * 60_000, anchor: 'ready' };
  }
  if (o.accepted_at) {
    return { target: new Date(o.accepted_at).getTime() + (prep + leg) * 60_000, anchor: 'accepted' };
  }
  return { target: new Date(o.opened_at).getTime() + (prep + leg) * 60_000, anchor: 'opened' };
}

export function etaLabel(o: EtaSource, now = Date.now()): string | null {
  const t = computeEtaTarget(o);
  if (!t) return null;
  const diff = Math.round((t.target - now) / 60_000);
  if (diff <= 0) return 'a qualquer momento';
  if (diff === 1) return 'cerca de 1 minuto';
  return `cerca de ${diff} minutos`;
}

export function etaClock(o: EtaSource): string | null {
  const t = computeEtaTarget(o);
  if (!t) return null;
  return new Date(t.target).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
