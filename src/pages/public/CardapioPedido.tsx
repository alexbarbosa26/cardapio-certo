import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchPublicOrder, PAYMENT_LABELS, type PaymentMethod } from '@/lib/digital-menu-cart';
import { fmtBRL, fmtDateTime } from '@/lib/format';
import { CheckCircle2, Clock, ChefHat, Bike, PackageCheck, XCircle, ArrowLeft } from 'lucide-react';

const STATUS_LABEL: Record<string, { label: string; tone: string; icon: typeof Clock }> = {
  aguardando_aceite: { label: 'Aguardando o restaurante aceitar', tone: 'bg-amber-100 text-amber-900 border-amber-200', icon: Clock },
  aberto: { label: 'Em preparo', tone: 'bg-blue-100 text-blue-900 border-blue-200', icon: ChefHat },
  fechado: { label: 'Concluído', tone: 'bg-emerald-100 text-emerald-900 border-emerald-200', icon: PackageCheck },
  cancelado: { label: 'Cancelado', tone: 'bg-neutral-100 text-neutral-700 border-neutral-200', icon: XCircle },
  recusado: { label: 'Recusado pelo estabelecimento', tone: 'bg-red-100 text-red-900 border-red-200', icon: XCircle },
};

export default function CardapioPedido() {
  const { slug = '', token = '' } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['public-order', token],
    queryFn: () => fetchPublicOrder(token),
    refetchInterval: 15_000,
    enabled: !!token,
  });

  useEffect(() => {
    if (data?.company?.name) document.title = `Pedido · ${data.company.name}`;
  }, [data]);

  if (isLoading) return <div className="min-h-screen grid place-items-center text-neutral-500">Carregando pedido…</div>;
  if (error || !data?.found || !data.order) {
    return (
      <div className="min-h-screen grid place-items-center bg-neutral-50 px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold">Pedido não encontrado</h1>
          <p className="mt-2 text-sm text-neutral-600">O link pode estar incorreto ou expirado.</p>
          <Link to={`/cardapio/${slug}`} className="mt-4 inline-flex items-center gap-1 text-sm underline"><ArrowLeft className="h-3 w-3" /> Voltar ao cardápio</Link>
        </div>
      </div>
    );
  }

  const order = data.order;
  const brand = data.company?.primary_color ?? '#111827';
  const st = STATUS_LABEL[order.status] ?? STATUS_LABEL.aberto;
  const Icon = st.icon;

  return (
    <div className="min-h-screen bg-neutral-50 pb-16">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center justify-between">
          <Link to={`/cardapio/${slug}`} className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900">
            <ArrowLeft className="h-4 w-4" /> Cardápio
          </Link>
          <div className="text-sm font-medium truncate">{data.company?.name}</div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6 space-y-5">
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm border">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full text-white" style={{ background: brand }}>
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h1 className="mt-3 text-xl font-semibold">Pedido #{order.order_number}</h1>
          <p className="text-sm text-neutral-500">Enviado em {fmtDateTime(order.opened_at)}</p>
          <div className={`mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${st.tone}`}>
            <Icon className="h-4 w-4" /> {st.label}
          </div>
        </div>

        <Section title="Itens">
          <ul className="divide-y">
            {order.items.map((it, idx) => (
              <li key={idx} className="py-2 flex justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{it.quantity}× {it.name}</div>
                  {it.notes && <div className="text-xs text-neutral-500">{it.notes}</div>}
                </div>
                <div className="text-right tabular-nums">{fmtBRL(it.total_price)}</div>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1 border-t pt-3 text-sm">
            <Row label="Subtotal" value={fmtBRL(order.subtotal)} />
            {order.delivery_fee > 0 && <Row label="Taxa de entrega" value={fmtBRL(order.delivery_fee)} />}
            <Row label="Total" value={fmtBRL(order.total)} bold />
          </div>
        </Section>

        <Section title="Entrega">
          <div className="text-sm space-y-1">
            <Row label="Modo" value={order.service_mode === 'delivery' ? <span className="inline-flex items-center gap-1"><Bike className="h-3.5 w-3.5" /> Entrega</span> : 'Retirada'} />
            {order.service_mode === 'delivery' && order.delivery_address && (
              <div className="text-neutral-700">
                {order.delivery_address.street}, {order.delivery_address.number}
                {order.delivery_address.complement ? ` — ${order.delivery_address.complement}` : ''}<br />
                {order.delivery_address.neighborhood}
                {order.delivery_address.reference ? <div className="text-xs text-neutral-500">Ref: {order.delivery_address.reference}</div> : null}
              </div>
            )}
          </div>
        </Section>

        <Section title="Pagamento">
          <div className="text-sm space-y-1">
            <Row label="Forma" value={PAYMENT_LABELS[order.payment_method as PaymentMethod] ?? order.payment_method} />
            {order.change_for ? <Row label="Troco para" value={fmtBRL(order.change_for)} /> : null}
          </div>
        </Section>

        {order.customer_notes && (
          <Section title="Observações"><div className="text-sm text-neutral-700 whitespace-pre-wrap">{order.customer_notes}</div></Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white border p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? 'font-semibold text-base pt-1' : 'text-neutral-600'}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
