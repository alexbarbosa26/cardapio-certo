import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fmtBRL } from '@/lib/format';
import { printThermal } from '@/lib/print-order';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Banknote, CreditCard, QrCode, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';

type Method = 'dinheiro' | 'pix' | 'debito' | 'credito';

interface Props {
  orderId: string;
  tableId: string;
  tableName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

interface Order {
  id: string; subtotal: number; service_fee_percentage: number; service_fee_amount: number;
  discount: number; total: number; order_number: number;
}

const FEES: Record<Method, number> = { dinheiro: 0, pix: 0, debito: 1.37, credito: 3.17 };

export function CheckoutDialog({ orderId, tableId, tableName, open, onOpenChange }: Props) {
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [withFee, setWithFee] = useState(false);
  const [feePct, setFeePct] = useState(10);
  const [discount, setDiscount] = useState(0);
  const [method, setMethod] = useState<Method>('dinheiro');
  const [received, setReceived] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: o } = await supabase.from('orders').select('*').eq('id', orderId).single();
      if (!o) return;
      setOrder({
        id: o.id, order_number: o.order_number,
        subtotal: Number(o.subtotal), service_fee_percentage: Number(o.service_fee_percentage),
        service_fee_amount: Number(o.service_fee_amount), discount: Number(o.discount), total: Number(o.total),
      });
      const { data: its } = await supabase.from('order_items').select('product_name, quantity, unit_price, total_price').eq('order_id', orderId);
      setItems((its ?? []).map((i: any) => ({ ...i, total_price: Number(i.total_price), unit_price: Number(i.unit_price) })));
      const { data: st } = await supabase.from('settings').select('service_fee_percentage').eq('company_id', o.company_id).maybeSingle();
      if (st?.service_fee_percentage != null) setFeePct(Number(st.service_fee_percentage));
      setWithFee(false);
    })();
  }, [open, orderId]);

  if (!order) return null;

  const subtotal = items.reduce((s, i) => s + i.total_price, 0);
  const fee = withFee ? subtotal * (feePct / 100) : 0;
  const total = Math.max(0, subtotal + fee - discount);
  const received_n = Number(received.replace(',', '.')) || 0;
  const change = method === 'dinheiro' ? Math.max(0, received_n - total) : 0;
  const cardFee = total * (FEES[method] / 100);
  const net = total - cardFee;

  const finalize = async () => {
    if (method === 'dinheiro' && received_n < total) { toast.error('Valor recebido insuficiente.'); return; }
    const { data: orderRow } = await supabase.from('orders').select('company_id').eq('id', orderId).single();
    if (!orderRow) { toast.error('Pedido não encontrado.'); return; }

    // procura caixa aberto
    const { data: reg } = await supabase.from('cash_registers').select('id')
      .eq('company_id', orderRow.company_id).eq('status', 'aberto')
      .order('opened_at', { ascending: false }).limit(1).maybeSingle();

    await supabase.from('orders').update({
      status: 'fechado', closed_at: new Date().toISOString(),
      subtotal, service_fee_amount: fee, discount, total,
      service_fee_percentage: withFee ? feePct : 0,
    }).eq('id', orderId);

    await supabase.from('payments').insert({
      company_id: orderRow.company_id, order_id: orderId,
      register_id: reg?.id ?? null, method, amount: total,
      fee_percentage: FEES[method], fee_amount: cardFee, net_amount: net,
    });

    await supabase.from('tables').update({ status: 'livre' }).eq('id', tableId);
    if (!reg) toast.warning('Pagamento registrado, mas nenhum caixa está aberto.');
    toast.success(`Conta da ${tableName} fechada.`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-baseline gap-2">
            <span className="font-display text-2xl">{tableName}</span>
            <span className="text-xs uppercase text-muted-foreground">Fechamento</span>
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto space-y-4">
          <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
            {items.map((it, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="truncate">{it.quantity}× {it.product_name}</span>
                <span className="font-medium tabular-nums">{fmtBRL(it.total_price)}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
            <div>
              <div className="text-sm font-medium">Taxa de serviço ({feePct}%)</div>
              <div className="text-xs text-muted-foreground">Opcional · inclui ou remove os {feePct}%</div>
            </div>
            <Switch checked={withFee} onCheckedChange={setWithFee} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Desconto (R$)</Label>
              <Input type="number" min={0} step="0.01" value={discount}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)} />
            </div>
            <div className="flex flex-col justify-end">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total a pagar</div>
              <div className="font-display text-3xl">{fmtBRL(total)}</div>
            </div>
          </div>

          <div>
            <Label>Forma de pagamento</Label>
            <div className="mt-1.5 grid grid-cols-4 gap-2">
              {([
                { id: 'dinheiro', label: 'Dinheiro', icon: Banknote },
                { id: 'pix', label: 'Pix', icon: QrCode },
                { id: 'debito', label: 'Débito', icon: CreditCard },
                { id: 'credito', label: 'Crédito', icon: CreditCard },
              ] as { id: Method; label: string; icon: any }[]).map((m) => {
                const Icon = m.icon;
                const active = method === m.id;
                return (
                  <button key={m.id} onClick={() => setMethod(m.id)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition',
                      active ? 'border-accent bg-accent/10 text-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground',
                    )}>
                    <Icon className="h-4 w-4" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {method === 'dinheiro' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor recebido</Label>
                <Input value={received} onChange={(e) => setReceived(e.target.value)} placeholder="0,00" />
              </div>
              <div className="flex flex-col justify-end">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Troco</div>
                <div className="text-2xl font-semibold">{fmtBRL(change)}</div>
              </div>
            </div>
          )}

          {(method === 'debito' || method === 'credito') && (
            <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs space-y-1">
              <Row label="Valor bruto" value={fmtBRL(total)} />
              <Row label={`Taxa ${FEES[method]}%`} value={`- ${fmtBRL(cardFee)}`} />
              <Row label="Valor líquido" value={fmtBRL(net)} bold />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={() => printThermal({
            title: tableName,
            subtitle: `Conta · Pedido #${order.order_number}`,
            showPrices: true,
            showUnitPrice: true,
            items: items.map((i) => ({ quantity: i.quantity, product_name: i.product_name, unit_price: i.unit_price, total_price: i.total_price })),
            totals: [
              { label: 'Subtotal', value: fmtBRL(subtotal) },
              ...(withFee ? [{ label: `Taxa serviço (${feePct}%)`, value: fmtBRL(fee) }] : []),
              ...(discount > 0 ? [{ label: 'Desconto', value: `- ${fmtBRL(discount)}` }] : []),
              { label: 'Total', value: fmtBRL(total), bold: true },
            ],
            footer: 'Obrigado pela preferência!',
          })}><Printer className="h-4 w-4 mr-1" /> Imprimir</Button>
          <Button onClick={finalize} className="bg-primary">Confirmar pagamento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={cn('flex justify-between', bold && 'font-semibold text-sm pt-1 border-t border-border mt-1')}>
      <span className="text-muted-foreground">{label}</span><span>{value}</span>
    </div>
  );
}
