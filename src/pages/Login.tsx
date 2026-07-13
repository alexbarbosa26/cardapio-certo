import { useNavigate, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ChefHat } from 'lucide-react';

function LoginPage() {
  const { user, signIn, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await signIn(email, password);
    setSubmitting(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success('Bem-vindo de volta!');
      navigate('/');
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
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
        </div>
      </div>

      <div className="relative hidden lg:block bg-primary text-primary-foreground overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, oklch(0.72 0.13 75) 0, transparent 40%), radial-gradient(circle at 80% 70%, oklch(0.72 0.13 75) 0, transparent 40%)',
        }}/>
        <div className="relative flex h-full flex-col justify-between p-16">
          <div />
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

export default LoginPage;
