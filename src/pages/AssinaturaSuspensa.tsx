import { useAuth } from '@/hooks/use-auth';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AlertTriangle, MessageCircle, LogOut, ArrowRight } from 'lucide-react';

const statusLabel: Record<string, string> = {
  suspended: 'suspenso',
  canceled: 'cancelado',
  past_due: 'em atraso',
  expired: 'expirado',
  pending_payment: 'com pagamento pendente',
  failed: 'com falha de pagamento',
};

export default function AssinaturaSuspensa() {
  const { signOut, subscription } = useAuth();
  const navigate = useNavigate();
  const label = statusLabel[subscription?.status ?? ''] ?? 'inativo';
  return (
    <div className="min-h-screen grid place-items-center bg-background px-6">
      <div className="max-w-md text-center space-y-6">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-destructive/15 text-destructive">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <div>
          <h1 className="font-display text-3xl">Assinatura {label}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua assinatura precisa ser regularizada para continuar usando o MesaChef.
            Entre em contato com o suporte ou escolha um novo plano para retomar o acesso.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button asChild>
            <Link to="/#planos">Ver planos <ArrowRight className="h-4 w-4" /></Link>
          </Button>
          <Button asChild variant="outline">
            <a href="https://wa.me/5500000000000" target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4" /> Falar com o suporte
            </a>
          </Button>
          <Button variant="ghost" onClick={async () => { await signOut(); navigate('/login'); }}>
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
