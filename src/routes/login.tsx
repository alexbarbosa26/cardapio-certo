import { createFileRoute, useNavigate, Navigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ChefHat, Sparkles } from 'lucide-react';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const { user, signIn, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@gmail.com');
  const [password, setPassword] = useState('admin123');
  const [submitting, setSubmitting] = useState(false);
  const [seeding, setSeeding] = useState(false);

  if (!loading && user) return <Navigate to="/" />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await signIn(email, password);
    setSubmitting(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success('Bem-vindo de volta!');
      navigate({ to: '/' });
    }
  };

  const seed = async () => {
    setSeeding(true);
    try {
      const r = await fetch('/api/public/seed-demo', { method: 'POST' });
      const j = await r.json();
      if (j.ok) toast.success('Dados de demonstração prontos. Use admin@gmail.com / admin123.');
      else toast.error(j.error ?? 'Falha ao criar demo.');
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro de rede.');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left — form */}
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <ChefHat className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">MesaChef</span>
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-foreground">SaaS</span>
          </div>

          <h1 className="mt-10 font-display text-4xl text-foreground">Bem-vindo<br/>de volta.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Acesse o painel do seu restaurante para gerenciar mesas, pedidos e cozinha.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" autoComplete="email" required
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" disabled={submitting} className="w-full h-11 bg-primary hover:bg-primary/90">
              {submitting ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>

          <div className="mt-8 rounded-lg border border-dashed border-border bg-secondary/40 p-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-accent" /> Acesso de demonstração
            </div>
            <p className="mt-1">Clique para criar a empresa demo, usuários e cardápio de exemplo.</p>
            <Button variant="outline" size="sm" disabled={seeding} onClick={seed} className="mt-3 w-full">
              {seeding ? 'Preparando…' : 'Criar dados de demonstração'}
            </Button>
            <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px]">
              <div className="rounded border border-border bg-card p-2">
                <div className="text-muted-foreground">Admin</div>
                <div>admin@gmail.com</div>
                <div>admin123</div>
              </div>
              <div className="rounded border border-border bg-card p-2">
                <div className="text-muted-foreground">Atendente</div>
                <div>staff@gmail.com</div>
                <div>staff123</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right — visual */}
      <div className="relative hidden lg:block bg-primary text-primary-foreground overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, oklch(0.72 0.13 75) 0, transparent 40%), radial-gradient(circle at 80% 70%, oklch(0.72 0.13 75) 0, transparent 40%)',
        }}/>
        <div className="relative flex h-full flex-col justify-between p-16">
          <div className="text-sm font-medium uppercase tracking-[0.2em] text-accent">White Label · 2026</div>
          <div>
            <p className="font-display text-5xl leading-tight text-balance">
              "A operação inteira do salão à cozinha, num só lugar."
            </p>
            <div className="mt-8 h-px w-12 bg-accent" />
            <p className="mt-4 text-sm text-primary-foreground/70">
              Multi-restaurante · Mobile-first · Pedidos em tempo real
            </p>
          </div>
          <div className="text-xs text-primary-foreground/50">
            © {new Date().getFullYear()} MesaChef
          </div>
        </div>
      </div>
    </div>
  );
}
