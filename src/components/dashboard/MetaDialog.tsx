import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DecimalInput } from '@/components/ui/decimal-input';
import { Label } from '@/components/ui/label';
import { parseDecimal } from '@/lib/decimal';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  year: number;
  month: number;
  initialValue: number;
  onSaved: () => void;
}

export function MetaDialog({ open, onOpenChange, companyId, year, month, initialValue, onSaved }: Props) {
  const [value, setValue] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setValue(initialValue > 0 ? initialValue : 0);
  }, [open, initialValue]);

  const save = async () => {
    const n = Number.isFinite(value) ? value : parseDecimal(value);
    if (!Number.isFinite(n) || n < 0) {
      toast.error('Informe um valor válido.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('sales_goals')
      .upsert(
        { company_id: companyId, year, month, target_amount: n },
        { onConflict: 'company_id,year,month' },
      );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Meta salva.');
    onOpenChange(false);
    onSaved();
  };

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="capitalize">Meta de {monthLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Meta de faturamento (R$)</Label>
            <DecimalInput
              autoFocus
              value={value}
              onChange={(v) => setValue(Number.isFinite(v) ? v : 0)}
              placeholder="0,00"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Defina o valor que sua operação pretende faturar no mês.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving} className="bg-primary">
            {saving ? 'Salvando...' : 'Salvar meta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
