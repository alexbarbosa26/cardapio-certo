import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { ArrowLeft, UtensilsCrossed, ShieldCheck } from 'lucide-react';
import { billing } from '@/lib/payments';
import type { BillingCycle } from '@/lib/payments';

interface Plan {
  id: string; name: string; slug: string; short_description: string | null;
  monthly_price: number; annual_price: number; trial_days: number;
}

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Contratar() {
  const { planSlug } = useParams<{ planSlug: string }>();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    company_name: '', trade_name: '', document: '',
    responsible_name: '', responsible_phone: '',
    city: '', state: '',
    admin_email: '', admin_password: '', admin_password_confirm: '',
  });

  useEffect(() => {
    (async () => {
      if (!planSlug) return;
      const { data } = await supabase
        .from('plans')
        .select('id,name,slug,short_description,monthly_price,annual_price,trial_days')
        .eq('slug', planSlug)
        .eq('status', 'ativo')
        .eq('show_on_landing_page', true)
        .maybeSingle();
      setPlan(data as Plan | null);
    })();
  }, [planSlug]);

  const amount = useMemo(() => {
    if (!plan) return 0;
    return cycle === 'annual' ? Number(plan.annual_price) : Number(plan.monthly_price);
  }, [plan, cycle]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan) return;
    if (form.admin_password.length < 6) return toast.error('A senha deve ter ao menos 6 caracteres.');
    if (form.admin_password !== form.admin_password_confirm) return toast.error('As senhas não conferem.');
    setLoading(true);
    try {
      const { checkout_session_id } = await billing.signupAndCheckout({
        plan_slug: plan.slug,
        billing_cycle: cycle,
        company_name: form.company_name,
        trade_name: form.trade_name || undefined,
        document: form.document || undefined,
        responsible_name: form.responsible_name,
        responsible_phone: form.responsible_phone || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        admin_email: form.admin_email,
        admin_password: form.admin_password,
      });
      toast.success('Cadastro criado! Vamos finalizar o pagamento.');
      navigate(`/checkout/${checkout_session_id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!plan) {
    return (
      <div className="min-h-screen bg-background grid place-items-center px-5">
        <Card className="max-w-md p-8 text-center space-y-4">
          <h1 className="font-display text-2xl">Plano não encontrado</h1>
          <p className="text-sm text-muted-foreground">O plano que você tentou contratar não está disponível.</p>
          <Button asChild><Link to="/">Voltar para a página inicial</Link></Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <UtensilsCrossed className="h-4 w-4" />
            </span>
            MesaChef
          </Link>
          <Button asChild variant="ghost" size="sm"><Link to="/"><ArrowLeft className="h-4 w-4" /> Voltar</Link></Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-8 px-5 py-12 lg:grid-cols-[1fr_360px]">
        <Card className="p-7">
          <h1 className="font-display text-2xl font-semibold">Crie sua conta no MesaChef</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Preencha os dados da sua empresa para iniciar a contratação do plano <strong>{plan.name}</strong>.
          </p>
          <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
            <Field label="Nome da empresa *" className="sm:col-span-2">
              <Input value={form.company_name} onChange={set('company_name')} required />
            </Field>
            <Field label="Nome fantasia">
              <Input value={form.trade_name} onChange={set('trade_name')} />
            </Field>
            <Field label="CNPJ / CPF">
              <Input value={form.document} onChange={set('document')} />
            </Field>
            <Field label="Responsável *">
              <Input value={form.responsible_name} onChange={set('responsible_name')} required />
            </Field>
            <Field label="WhatsApp / telefone">
              <Input value={form.responsible_phone} onChange={set('responsible_phone')} placeholder="(11) 99999-9999" />
            </Field>
            <Field label="Cidade">
              <Input value={form.city} onChange={set('city')} />
            </Field>
            <Field label="UF">
              <Input value={form.state} onChange={set('state')} maxLength={2} placeholder="SP" />
            </Field>

            <div className="sm:col-span-2 mt-2 border-t border-border pt-4">
              <h2 className="font-semibold">Acesso ao sistema</h2>
              <p className="text-xs text-muted-foreground">Será o usuário administrador da sua empresa.</p>
            </div>
            <Field label="E-mail *" className="sm:col-span-2">
              <Input type="email" value={form.admin_email} onChange={set('admin_email')} required />
            </Field>
            <Field label="Senha *">
              <Input type="password" value={form.admin_password} onChange={set('admin_password')} required minLength={6} />
            </Field>
            <Field label="Confirmar senha *">
              <Input type="password" value={form.admin_password_confirm} onChange={set('admin_password_confirm')} required minLength={6} />
            </Field>

            <Button type="submit" className="sm:col-span-2 mt-2" size="lg" disabled={loading}>
              {loading ? 'Criando conta...' : 'Continuar para o pagamento'}
            </Button>
          </form>
        </Card>

        <div className="space-y-4">
          <Card className="p-6">
            <h3 className="font-display text-lg">Resumo</h3>
            <div className="mt-2">
              <div className="text-xs uppercase text-muted-foreground">Plano</div>
              <div className="font-semibold">{plan.name}</div>
              {plan.short_description && (
                <p className="text-sm text-muted-foreground">{plan.short_description}</p>
              )}
            </div>
            <Tabs value={cycle} onValueChange={(v) => setCycle(v as BillingCycle)} className="mt-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="monthly">Mensal</TabsTrigger>
                <TabsTrigger value="annual" disabled={Number(plan.annual_price) <= 0}>Anual</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Valor</span>
              <span className="font-display text-2xl font-semibold">{formatBRL(amount)}</span>
            </div>
            {plan.trial_days > 0 && (
              <p className="mt-2 rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                Inclui {plan.trial_days} dias de teste grátis
              </p>
            )}
          </Card>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground">
            <ShieldCheck className="mb-2 h-4 w-4 text-primary" />
            Seu cadastro é criado de forma segura. Você poderá cancelar a qualquer momento pelo painel.
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className ?? ''}>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
