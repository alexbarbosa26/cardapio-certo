import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useBusy } from '@/hooks/use-busy';
import { ArrowRight } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  fromTableId: string;
  fromTableName: string;
  onTransferred?: () => void;
}

interface TableOption {
  id: string;
  name: string;
  number: number;
  status: string;
  has_open_order: boolean;
}

export function TransferOrderDialog({ open, onOpenChange, orderId, fromTableId, fromTableName, onTransferred }: Props) {
  const { profile } = useAuth();
  const [tables, setTables] = useState<TableOption[]>([]);
  const [destId, setDestId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const { busy, run } = useBusy();

  useEffect(() => {
    if (!open || !profile) return;
    setDestId('');
    setReason('');
    setLoading(true);
    (async () => {
      const [{ data: tbls }, { data: openOrders }] = await Promise.all([
        supabase.from('tables').select('id,name,number,status')
          .eq('company_id', profile.company_id).order('number'),
        supabase.from('orders').select('table_id')
          .eq('company_id', profile.company_id).eq('status', 'aberto'),
      ]);
      const openSet = new Set((openOrders ?? []).map((o: any) => o.table_id));
      const list: TableOption[] = (tbls ?? [])
        .filter((t: any) => t.id !== fromTableId)
        .map((t: any) => ({ ...t, has_open_order: openSet.has(t.id) }));
      setTables(list);
      setLoading(false);
    })();
  }, [open, profile?.company_id, fromTableId]);

  const dest = tables.find((t) => t.id === destId);

  const confirm = () =>
    run(async () => {
      if (!profile || !dest) return;
      // Bloqueio: destino com pedido aberto (evita duplicidade/mesclagem acidental)
      if (dest.has_open_order) {
        toast.error('A mesa de destino já possui um pedido aberto. Feche ou finalize-o antes de transferir.');
        return;
      }

      // 1) Reconfirma que o pedido continua aberto e pertence à empresa
      const { data: order, error: eOrd } = await supabase
        .from('orders')
        .select('id,status,table_id,company_id,order_number')
        .eq('id', orderId).maybeSingle();
      if (eOrd || !order) { toast.error('Pedido não encontrado.'); return; }
      if (order.company_id !== profile.company_id) { toast.error('Pedido de outra empresa.'); return; }
      if (order.status !== 'aberto') { toast.error('Só é possível transferir pedidos em aberto.'); return; }

      // 2) Move o pedido
      const { error: eUpd } = await supabase
        .from('orders').update({ table_id: dest.id }).eq('id', orderId);
      if (eUpd) { toast.error(eUpd.message); return; }

      // 3) Atualiza status das mesas (origem livre, destino ocupada)
      await Promise.all([
        supabase.from('tables').update({ status: 'livre' }).eq('id', fromTableId),
        supabase.from('tables').update({ status: 'ocupada' }).eq('id', dest.id),
      ]);

      // 4) Auditoria — best effort (não bloqueia caso a política restrinja)
      await supabase.from('audit_logs').insert({
        actor_user_id: profile.id,
        company_id: profile.company_id,
        action: 'order.transfer',
        entity_type: 'order',
        entity_id: orderId,
        new_value: {
          order_number: order.order_number,
          from_table_id: fromTableId,
          from_table_name: fromTableName,
          to_table_id: dest.id,
          to_table_name: dest.name,
          reason: reason.trim() || null,
        },
      });

      toast.success(`Pedido transferido para ${dest.name}.`);
      onOpenChange(false);
      onTransferred?.();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir pedido</DialogTitle>
          <DialogDescription>
            Mova o pedido atual de <strong>{fromTableName}</strong> para outra mesa preservando itens,
            valores e observações.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Mesa de destino</Label>
            {loading ? (
              <div className="text-sm text-muted-foreground mt-2">Carregando mesas…</div>
            ) : (
              <div className="mt-2 grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-56 overflow-y-auto pr-1">
                {tables.map((t) => {
                  const disabled = t.has_open_order;
                  const active = destId === t.id;
                  return (
                    <button
                      type="button" key={t.id}
                      disabled={disabled}
                      onClick={() => setDestId(t.id)}
                      title={disabled ? 'Já possui pedido aberto' : t.name}
                      className={[
                        'rounded-lg border p-2 text-center text-sm transition',
                        active ? 'border-accent bg-accent/10' :
                          disabled ? 'border-border/60 bg-muted/40 text-muted-foreground opacity-60 cursor-not-allowed'
                                   : 'border-border bg-card hover:border-foreground/30',
                      ].join(' ')}
                    >
                      <div className="font-display text-lg leading-none">{String(t.number).padStart(2, '0')}</div>
                      <div className="text-[10px] uppercase text-muted-foreground mt-1">
                        {disabled ? 'Ocupada' : 'Livre'}
                      </div>
                    </button>
                  );
                })}
                {tables.length === 0 && (
                  <div className="col-span-full text-sm text-muted-foreground">
                    Nenhuma outra mesa disponível.
                  </div>
                )}
              </div>
            )}
          </div>

          {dest && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{fromTableName}</span>
              <ArrowRight className="h-4 w-4" />
              <span className="font-medium text-foreground">{dest.name}</span>
            </div>
          )}

          <div>
            <Label>Motivo (opcional)</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: cliente mudou de mesa" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={confirm} disabled={busy || !destId} className="bg-primary">
            {busy ? 'Transferindo…' : 'Confirmar transferência'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
