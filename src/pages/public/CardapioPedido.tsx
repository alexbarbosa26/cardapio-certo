import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchPublicOrder, PAYMENT_LABELS, type PaymentMethod } from '@/lib/digital-menu-cart';
import { fmtBRL, fmtDateTime } from '@/lib/format';
import { CheckCircle2, Clock, ChefHat, Bike, PackageCheck, XCircle, ArrowLeft, Circle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<string, { label: string; tone: string; icon: typeof Clock }> = {
  aguardando_aceite: { label: 'Aguardando o restaurante aceitar', tone: 'bg-amber-100 text-amber-900 border-amber-200', icon: Clock },
  em_preparo: { label: 'Em preparo na cozinha', tone: 'bg-blue-100 text-blue-900 border-blue-200', icon: ChefHat },
  aberto: { label: 'Em preparo', tone: 'bg-blue-100 text-blue-900 border-blue-200', icon: ChefHat },
  pronto: { label: 'Pronto para retirada/saída', tone: 'bg-emerald-100 text-emerald-900 border-emerald-200', icon: PackageCheck },
  em_entrega: { label: 'Saiu para entrega', tone: 'bg-indigo-100 text-indigo-900 border-indigo-200', icon: Bike },
  entregue: { label: 'Entregue', tone: 'bg-emerald-100 text-emerald-900 border-emerald-200', icon: CheckCircle2 },
  fechado: { label: 'Concluído', tone: 'bg-emerald-100 text-emerald-900 border-emerald-200', icon: PackageCheck },
  cancelado: { label: 'Cancelado', tone: 'bg-neutral-100 text-neutral-700 border-neutral-200', icon: XCircle },
  recusado: { label: 'Recusado pelo estabelecimento', tone: 'bg-red-100 text-red-900 border-red-200', icon: XCircle },
};

const FINAL_STATUSES = new Set(['entregue', 'fechado', 'cancelado', 'recusado']);

type Step = { key: string; label: string; at: string | null; icon: typeof Clock };

function buildSteps(order: NonNullable<Awaited<ReturnType<typeof fetchPublicOrder>>['order']>): Step[] {
  const steps: Step[] = [
    { key: 'opened', label: 'Pedido recebido', at: order.opened_at, icon: CheckCircle2 },
    { key: 'accepted', label: 'Aceito pelo estabelecimento', at: order.accepted_at, icon: ChefHat },
    { key: 'ready', label: order.service_mode === 'delivery' ? 'Pronto para sair' : 'Pronto para retirada', at: order.ready_at, icon: PackageCheck },
  ];
  if (order.service_mode === 'delivery') {
    steps.push({ key: 'dispatched', label: 'Saiu para entrega', at: order.dispatched_at, icon: Bike });
    steps.push({ key: 'delivered', label: 'Entregue', at: order.delivered_at, icon: CheckCircle2 });
  } else {
    steps.push({ key: 'delivered', label: 'Retirado', at: order.delivered_at, icon: CheckCircle2 });
  }
  return steps;
}

export default function CardapioPedido() {
  const { slug = '', token = '' } = useParams();
  const [copied, setCopied] = useState(false);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['public-order', token],
    queryFn: () => fetchPublicOrder(token),
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.order?.status;
      if (s && FINAL_STATUSES.has(s)) return false;
      return 10_000;
    },
    refetchIntervalInBackground: false,
    enabled: !!token,
  });

  useEffect(() => {
    if (data?.company?.name) document.title = `Pedido · ${data.company.name}`;
  }, [data]);

  const order = data?.order;
  const brand = data?.company?.primary_color ?? '#111827';
  const steps = useMemo(() => (order ? buildSteps(order) : []), [order]);

  const { label: eta, clock: etaAt } = useEta(order);

  if (isLoading) return <div className="min-h-screen grid place-items-center text-neutral-500">Carregando pedido…</div>;
  if (error || !data?.found || !order) {
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

  const st = STATUS_LABEL[order.status] ?? STATUS_LABEL.aberto;
  const Icon = st.icon;
  const isFinal = FINAL_STATUSES.has(order.status);
  const isCancelled = order.status === 'cancelado' || order.status === 'recusado';

  return (
    <div className="min-h-screen bg-neutral-50 pb-16">
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center justify-between">
          <Link to={`/cardapio/${slug}`} className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900">
            <ArrowLeft className="h-4 w-4" /> Cardápio
          </Link>
          <div className="text-sm font-medium truncate">{data.company?.name}</div>
          <div className="w-6 flex justify-end text-neutral-400">
            {isFetching && !isFinal ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6 space-y-5">
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm border">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full text-white" style={{ background: brand }}>
            <Icon className="h-7 w-7" />
          </div>
          <h1 className="mt-3 text-xl font-semibold">Pedido #{order.order_number}</h1>
          <p className="text-sm text-neutral-500">Enviado em {fmtDateTime(order.opened_at)}</p>
          <div className={`mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${st.tone}`}>
            <Icon className="h-4 w-4" /> {st.label}
          </div>
          {eta && !isFinal && (
            <p className="mt-3 text-sm text-neutral-600">
              Previsão: <span className="font-medium text-neutral-900">{eta}</span>
            </p>
          )}
          {isCancelled && order.rejection_reason && (
            <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              Motivo: {order.rejection_reason}
            </p>
          )}
        </div>

        {!isCancelled && (
          <Section title="Acompanhamento">
            <ol className="relative">
              {steps.map((s, idx) => {
                const done = !!s.at;
                const isCurrent = !done && steps.slice(0, idx).every((p) => !!p.at);
                const StepIcon = s.icon;
                return (
                  <li key={s.key} className="flex gap-3 pb-4 last:pb-0 relative">
                    {idx < steps.length - 1 && (
                      <span
                        className={cn(
                          'absolute left-[15px] top-8 bottom-0 w-px',
                          done ? 'bg-emerald-400' : 'bg-neutral-200',
                        )}
                      />
                    )}
                    <div
                      className={cn(
                        'relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2',
                        done
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : isCurrent
                            ? 'bg-white border-blue-500 text-blue-600 animate-pulse'
                            : 'bg-white border-neutral-300 text-neutral-400',
                      )}
                    >
                      {done ? <CheckCircle2 className="h-4 w-4" /> : isCurrent ? <StepIcon className="h-4 w-4" /> : <Circle className="h-3 w-3" />}
                    </div>
                    <div className="min-w-0 pt-1">
                      <div className={cn('text-sm font-medium', done ? 'text-neutral-900' : isCurrent ? 'text-neutral-900' : 'text-neutral-500')}>
                        {s.label}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {done ? fmtDateTime(s.at!) : isCurrent ? 'Em andamento…' : 'Pendente'}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Section>
        )}

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
            {order.driver_name && <Row label="Entregador" value={order.driver_name} />}
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
            <Row label="Situação" value={<PaymentBadge status={order.payment_status} />} />
            {order.change_for ? <Row label="Troco para" value={fmtBRL(order.change_for)} /> : null}
          </div>
          {order.payment_method === 'pix' && data.pix?.key && order.payment_status !== 'pago' && (
            <div className="mt-3 rounded-lg border bg-neutral-50 p-3 space-y-2">
              <div className="text-xs font-medium text-neutral-700">
                Pague com Pix{data.pix.holder ? ` para ${data.pix.holder}` : ''}
                {data.pix.key_type ? ` · chave ${data.pix.key_type}` : ''}
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-white border px-2 py-1.5 text-xs">{data.pix.key}</code>
                <button
                  type="button"
                  onClick={() => { void navigator.clipboard.writeText(data.pix!.key); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-white"
                  style={{ background: brand }}
                >
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
              <p className="text-[11px] text-neutral-500">
                Após o pagamento, envie o comprovante ao estabelecimento. A confirmação aparece aqui assim que for registrada.
              </p>
            </div>
          )}
        </Section>


        {order.customer_notes && (
          <Section title="Observações"><div className="text-sm text-neutral-700 whitespace-pre-wrap">{order.customer_notes}</div></Section>
        )}

        {!isFinal && (
          <p className="text-center text-xs text-neutral-400">
            Esta página atualiza automaticamente a cada poucos segundos.
          </p>
        )}
      </div>
    </div>
  );
}

/** ETA recalculado a partir dos marcos reais do pedido (aceite, pronto, saída). */
function useEta(order: EtaSource | undefined) {
  const [, tick] = useState(0);
  const status = order?.status;
  useEffect(() => {
    if (!status || FINAL_STATUSES.has(status)) return;
    const t = setInterval(() => tick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, [status]);
  if (!order) return { label: null as string | null, clock: null as string | null };
  return { label: etaLabel(order), clock: etaClock(order) };
}

const PAYMENT_STATUS_META: Record<string, { label: string; tone: string }> = {
  pendente: { label: 'Pagamento pendente', tone: 'bg-amber-100 text-amber-900 border-amber-200' },
  pago: { label: 'Pagamento confirmado', tone: 'bg-emerald-100 text-emerald-900 border-emerald-200' },
  estornado: { label: 'Pagamento estornado', tone: 'bg-red-100 text-red-900 border-red-200' },
};

function PaymentBadge({ status }: { status?: string | null }) {
  const meta = PAYMENT_STATUS_META[status ?? 'pendente'] ?? PAYMENT_STATUS_META.pendente;
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${meta.tone}`}>{meta.label}</span>;
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
