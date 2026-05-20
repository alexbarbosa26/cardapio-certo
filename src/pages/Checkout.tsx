import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { billing, type CheckoutSession } from '@/lib/payments';
import { toast } from 'sonner';
import { CheckCircle2, Clock, XCircle, UtensilsCrossed, ArrowRight, AlertTriangle } from 'lucide-react';

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

type Outcome = 'approve' | 'pending' | 'reject';

export default function Checkout() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<Outcome | null>(null);
  const [result, setResult] = useState<Outcome | null>(null);

  const load = async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const s = await billing.getCheckoutSession(sessionId);
      setSession(s);
      if (s.status === 'paid') setResult('approve');
      else if (s.status === 'failed') setResult('reject');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [sessionId]);

  const run = async (outcome: Outcome) => {
    if (!sessionId) return;
    setSubmitting(outcome);
    try {
      await billing.simulatePayment(sessionId, outcome);
      setResult(outcome);
      await load();
      if (outcome === 'approve') {
        toast.success('Pagamento aprovado! Você já pode acessar o sistema.');
      } else if (outcome === 'pending') {
        toast.info('Pagamento marcado como pendente.');
      } else {
        toast.error('Pagamento recusado.');
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background grid place-items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background grid place-items-center px-5">
        <Card className="max-w-md p-8 text-center space-y-4">
          <h1 className="font-display text-2xl">Sessão não encontrada</h1>
          <Button asChild><Link to="/">Voltar para a página inicial</Link></Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <UtensilsCrossed className="h-4 w-4" />
            </span>
            MesaChef
          </Link>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Checkout simulado</span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-12 space-y-6">
        <Card className="p-7">
          <h1 className="font-display text-2xl font-semibold">Finalizar contratação</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Empresa: <strong>{session.companies?.name}</strong> · Plano: <strong>{session.plans?.name}</strong>
          </p>
          <div className="mt-5 grid grid-cols-2 gap-4 rounded-lg border border-border/60 bg-muted/30 p-4 text-sm">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Ciclo</div>
              <div className="font-medium">{session.billing_cycle === 'annual' ? 'Anual' : 'Mensal'}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Valor</div>
              <div className="font-display text-xl font-semibold">{formatBRL(Number(session.amount))}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">E-mail de acesso</div>
              <div className="font-medium">{session.companies?.responsible_email ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Status</div>
              <div className="font-medium uppercase">{session.status}</div>
            </div>
          </div>

          <div className="mt-6 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> Ambiente de demonstração</div>
            <p className="mt-1">
              Este é um checkout simulado para validar todo o fluxo SaaS. Nenhuma cobrança real é feita.
              Em produção, esta etapa será substituída pelo gateway de pagamento escolhido.
            </p>
          </div>
        </Card>

        {result ? (
          <ResultCard outcome={result} onContinue={() => navigate('/login')} />
        ) : (
          <Card className="p-7 space-y-4">
            <h2 className="font-display text-lg font-semibold">Escolha um resultado para simular</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <SimBtn
                icon={CheckCircle2}
                title="Aprovar"
                description="Pagamento aprovado, libera o acesso."
                variant="default"
                loading={submitting === 'approve'}
                onClick={() => run('approve')}
              />
              <SimBtn
                icon={Clock}
                title="Pendente"
                description="Marca como aguardando pagamento."
                variant="outline"
                loading={submitting === 'pending'}
                onClick={() => run('pending')}
              />
              <SimBtn
                icon={XCircle}
                title="Recusar"
                description="Pagamento recusado, bloqueia o acesso."
                variant="outline"
                loading={submitting === 'reject'}
                onClick={() => run('reject')}
              />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function SimBtn({
  icon: Icon, title, description, variant, loading, onClick,
}: {
  icon: typeof CheckCircle2; title: string; description: string;
  variant: 'default' | 'outline'; loading: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={loading}
      className={`group flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition disabled:opacity-50 ${
        variant === 'default'
          ? 'border-primary bg-primary/5 hover:bg-primary/10'
          : 'border-border bg-background hover:bg-muted/40'
      }`}
    >
      <Icon className={`h-5 w-5 ${variant === 'default' ? 'text-primary' : 'text-muted-foreground'}`} />
      <div>
        <div className="font-medium">{loading ? 'Processando...' : title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </button>
  );
}

function ResultCard({ outcome, onContinue }: { outcome: Outcome; onContinue: () => void }) {
  if (outcome === 'approve') {
    return (
      <Card className="p-7 text-center space-y-3 border-primary/50">
        <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
        <h2 className="font-display text-2xl font-semibold">Pagamento aprovado!</h2>
        <p className="text-sm text-muted-foreground">Sua empresa já está ativa. Faça login para começar a usar o MesaChef.</p>
        <Button size="lg" onClick={onContinue}>Acessar o sistema <ArrowRight className="h-4 w-4" /></Button>
      </Card>
    );
  }
  if (outcome === 'pending') {
    return (
      <Card className="p-7 text-center space-y-3">
        <Clock className="mx-auto h-12 w-12 text-amber-500" />
        <h2 className="font-display text-2xl font-semibold">Pagamento pendente</h2>
        <p className="text-sm text-muted-foreground">
          Estamos aguardando a confirmação do pagamento. Você ainda pode entrar no sistema durante o período de teste.
        </p>
        <Button variant="outline" onClick={onContinue}>Ir para login</Button>
      </Card>
    );
  }
  return (
    <Card className="p-7 text-center space-y-3">
      <XCircle className="mx-auto h-12 w-12 text-destructive" />
      <h2 className="font-display text-2xl font-semibold">Pagamento recusado</h2>
      <p className="text-sm text-muted-foreground">Tente novamente com outro método ou contate o suporte.</p>
      <Button variant="outline" onClick={() => window.location.reload()}>Tentar novamente</Button>
    </Card>
  );
}
