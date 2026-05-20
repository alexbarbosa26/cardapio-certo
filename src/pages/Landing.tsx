import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  UtensilsCrossed, Coffee, IceCream, Beer, Cake, ChefHat,
  Smartphone, BarChart3, ReceiptText, Wallet, Users2, ClipboardList,
  Check, Star, ArrowRight,
} from 'lucide-react';

interface LandingPlan {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  monthly_price: number;
  annual_price: number;
  trial_days: number;
  max_users: number | null;
  max_tables: number | null;
  max_open_tabs: number | null;
  allow_tables_module: boolean;
  allow_tabs_module: boolean;
  allow_kitchen_module: boolean;
  allow_cash_register_module: boolean;
  allow_advanced_dashboard: boolean;
  allow_reports: boolean;
  is_featured: boolean;
  display_order: number;
}

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const benefits = [
  { icon: UtensilsCrossed, title: 'Controle de mesas', body: 'Visualize ocupação, abra e feche mesas em segundos.' },
  { icon: ClipboardList, title: 'Pedidos para a cozinha', body: 'Envie pedidos direto para o preparo, sem papel.' },
  { icon: ChefHat, title: 'Painel KDS', body: 'Cozinha vê tudo em tempo real com tempos de preparo.' },
  { icon: ReceiptText, title: 'Comandas', body: 'Conta por cliente, divisão da conta e fechamento ágil.' },
  { icon: Wallet, title: 'Caixa integrado', body: 'Sangria, suprimento, fechamento e relatório do dia.' },
  { icon: BarChart3, title: 'Dashboards', body: 'Vendas por dia, formas de pagamento e desempenho.' },
  { icon: Users2, title: 'Multi-usuário', body: 'Garçons, caixas e gerentes com permissões separadas.' },
  { icon: Smartphone, title: 'Funciona no celular', body: 'Use no tablet, celular ou desktop. Sem instalação.' },
];

const audience = [
  { icon: UtensilsCrossed, label: 'Restaurantes' },
  { icon: IceCream, label: 'Sorveterias' },
  { icon: Coffee, label: 'Cafeterias' },
  { icon: Cake, label: 'Docerias' },
  { icon: Beer, label: 'Bares' },
  { icon: ChefHat, label: 'Lanchonetes' },
];

const faqs = [
  { q: 'Preciso instalar algo?', a: 'Não. O MesaChef roda direto no navegador, no celular, tablet ou computador.' },
  { q: 'Posso usar no celular?', a: 'Sim. A interface é otimizada para garçons e caixas usarem no celular ou tablet.' },
  { q: 'Funciona para sorveteria ou açaiteria?', a: 'Sim. Há suporte a produtos vendidos por peso e fluxo simplificado de balcão.' },
  { q: 'Posso controlar comandas?', a: 'Sim, com comandas numeradas, divisão de conta e taxa de serviço configurável.' },
  { q: 'Posso cancelar quando quiser?', a: 'Sim. Você pode cancelar ou trocar de plano direto no painel da sua empresa.' },
  { q: 'Existe período de teste?', a: 'Sim, todos os planos contam com período de teste gratuito ao se cadastrar.' },
  { q: 'O sistema emite nota fiscal?', a: 'A emissão fiscal será integrada em uma etapa futura. Hoje, o foco é a operação do salão e do caixa.' },
  { q: 'Posso trocar de plano depois?', a: 'Sim. A troca é feita pela tela "Minha assinatura" e respeita os limites do plano escolhido.' },
];

export default function Landing() {
  const [plans, setPlans] = useState<LandingPlan[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('plans')
        .select('id,name,slug,short_description,monthly_price,annual_price,trial_days,max_users,max_tables,max_open_tabs,allow_tables_module,allow_tabs_module,allow_kitchen_module,allow_cash_register_module,allow_advanced_dashboard,allow_reports,is_featured,display_order')
        .eq('status', 'ativo')
        .eq('show_on_landing_page', true)
        .order('display_order', { ascending: true });
      setPlans((data ?? []) as LandingPlan[]);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2 font-display text-xl font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <UtensilsCrossed className="h-4 w-4" />
            </span>
            MesaChef
          </Link>
          <nav className="hidden gap-8 text-sm md:flex">
            <a href="#recursos" className="text-muted-foreground hover:text-foreground">Recursos</a>
            <a href="#planos" className="text-muted-foreground hover:text-foreground">Planos</a>
            <a href="#faq" className="text-muted-foreground hover:text-foreground">Dúvidas</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm"><Link to="/login">Entrar</Link></Button>
            <Button asChild size="sm"><a href="#planos">Começar agora</a></Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.08),transparent_60%)]" />
        <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Star className="h-3 w-3" /> SaaS para restaurantes e PDV
            </span>
            <h1 className="mt-5 font-display text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
              Controle <span className="text-primary">mesas, comandas, pedidos</span> e caixa do seu restaurante em um só lugar.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
              Um SaaS simples, moderno e acessível para restaurantes, sorveterias, cafeterias,
              lanchonetes e pequenos negócios alimentícios.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg"><a href="#planos">Ver planos <ArrowRight className="h-4 w-4" /></a></Button>
              <Button asChild variant="outline" size="lg"><Link to="/login">Acessar sistema</Link></Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Sem instalação · Funciona em qualquer dispositivo · Teste grátis</p>
          </div>
        </div>
      </section>

      {/* Benefícios */}
      <section id="recursos" className="border-b border-border/60 bg-muted/20">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-semibold md:text-4xl">Tudo que sua operação precisa</h2>
            <p className="mt-3 text-muted-foreground">
              Do salão ao caixa. Da cozinha aos relatórios. Sem precisar amarrar planilhas e sistemas paralelos.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((b) => (
              <Card key={b.title} className="border-border/60 p-5">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                  <b.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold">{b.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{b.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Para quem é */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-semibold md:text-4xl">Para o seu tipo de negócio</h2>
            <p className="mt-3 text-muted-foreground">
              Atendemos diferentes formatos de operação de alimentos e bebidas — do balcão ao salão completo.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {audience.map((a) => (
              <div key={a.label} className="flex flex-col items-center justify-center rounded-xl border border-border/60 bg-card p-5 text-center">
                <a.icon className="h-7 w-7 text-primary" />
                <span className="mt-3 text-sm font-medium">{a.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="border-b border-border/60 bg-muted/20">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-semibold md:text-4xl">Planos transparentes</h2>
            <p className="mt-3 text-muted-foreground">Escolha o plano certo para o tamanho da sua operação. Mude quando quiser.</p>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {plans.map((p) => (
              <Card
                key={p.id}
                className={`relative flex flex-col p-7 ${p.is_featured ? 'border-primary shadow-lg ring-1 ring-primary/30' : 'border-border/60'}`}
              >
                {p.is_featured && (
                  <span className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                    Recomendado
                  </span>
                )}
                <h3 className="font-display text-2xl font-semibold">{p.name}</h3>
                {p.short_description && (
                  <p className="mt-2 text-sm text-muted-foreground">{p.short_description}</p>
                )}
                <div className="mt-5 flex items-baseline gap-2">
                  <span className="font-display text-4xl font-semibold">{formatBRL(Number(p.monthly_price))}</span>
                  <span className="text-sm text-muted-foreground">/mês</span>
                </div>
                {Number(p.annual_price) > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    ou {formatBRL(Number(p.annual_price))}/ano
                  </p>
                )}
                {p.trial_days > 0 && (
                  <p className="mt-1 text-xs font-medium text-primary">{p.trial_days} dias grátis</p>
                )}
                <ul className="mt-6 space-y-2.5 text-sm">
                  <Feature ok>{p.max_users ? `Até ${p.max_users} usuários` : 'Usuários ilimitados'}</Feature>
                  <Feature ok>{p.max_tables ? `Até ${p.max_tables} mesas` : 'Mesas ilimitadas'}</Feature>
                  <Feature ok>{p.max_open_tabs ? `Até ${p.max_open_tabs} comandas abertas` : 'Comandas ilimitadas'}</Feature>
                  <Feature ok={p.allow_tables_module}>Módulo de mesas</Feature>
                  <Feature ok={p.allow_tabs_module}>Módulo de comandas</Feature>
                  <Feature ok={p.allow_kitchen_module}>Painel da cozinha (KDS)</Feature>
                  <Feature ok={p.allow_cash_register_module}>Controle de caixa</Feature>
                  <Feature ok={p.allow_advanced_dashboard}>Dashboard avançado</Feature>
                  <Feature ok={p.allow_reports}>Relatórios</Feature>
                </ul>
                <div className="mt-7">
                  <Button asChild className="w-full" variant={p.is_featured ? 'default' : 'outline'}>
                    <Link to={`/contratar/${p.slug}`}>Contratar {p.name}</Link>
                  </Button>
                </div>
              </Card>
            ))}
            {plans.length === 0 && (
              <p className="text-muted-foreground">Nenhum plano disponível no momento.</p>
            )}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-b border-border/60">
        <div className="mx-auto max-w-4xl px-5 py-20">
          <h2 className="font-display text-3xl font-semibold md:text-4xl">Perguntas frequentes</h2>
          <div className="mt-10 divide-y divide-border/60 rounded-xl border border-border/60 bg-card">
            {faqs.map((f) => (
              <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-center justify-between gap-4 font-medium">
                  {f.q}
                  <span className="text-muted-foreground transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-background">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2 font-display text-lg font-semibold">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                <UtensilsCrossed className="h-4 w-4" />
              </span>
              MesaChef
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Sistema de gestão para restaurantes, bares e PDVs alimentícios.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold">Produto</h4>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><a href="#recursos" className="hover:text-foreground">Recursos</a></li>
              <li><a href="#planos" className="hover:text-foreground">Planos</a></li>
              <li><Link to="/login" className="hover:text-foreground">Entrar</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold">Contato</h4>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>Comercial: comercial@mesachef.com.br</li>
              <li>Suporte: suporte@mesachef.com.br</li>
              <li className="text-xs">Termos de uso · Política de privacidade</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border/60">
          <div className="mx-auto max-w-6xl px-5 py-5 text-xs text-muted-foreground">
            © {new Date().getFullYear()} MesaChef. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
}

function Feature({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-start gap-2 ${ok ? '' : 'text-muted-foreground/60 line-through'}`}>
      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${ok ? 'text-primary' : 'text-muted-foreground/40'}`} />
      <span>{children}</span>
    </li>
  );
}
