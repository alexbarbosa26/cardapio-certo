import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { buildThermalHtml, openPrintWindow, subscribePrintPreview, type PrintOptions } from '@/lib/print-order';

export function PrintPreviewDialog() {
  const [opts, setOpts] = useState<PrintOptions | null>(null);

  useEffect(() => subscribePrintPreview(setOpts), []);

  const html = useMemo(() => (opts ? buildThermalHtml(opts) : ''), [opts]);

  return (
    <Dialog open={!!opts} onOpenChange={(o) => !o && setOpts(null)}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="text-base">Prévia da impressão</DialogTitle>
          <p className="text-xs text-muted-foreground">Largura simulada: 80mm</p>
        </DialogHeader>

        <div className="bg-muted/40 px-4 py-3 max-h-[60vh] overflow-y-auto flex justify-center">
          <div className="bg-white shadow-md" style={{ width: '302px' }}>
            <iframe
              title="Prévia térmica"
              srcDoc={html}
              className="w-full border-0 block"
              style={{ height: '60vh', width: '302px' }}
            />
          </div>
        </div>

        <DialogFooter className="p-4 pt-3 gap-2">
          <Button variant="outline" onClick={() => setOpts(null)}>Cancelar</Button>
          <Button
            onClick={() => {
              if (opts) openPrintWindow(opts);
              setOpts(null);
            }}
          >
            <Printer className="h-4 w-4 mr-1" /> Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
