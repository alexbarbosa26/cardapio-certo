import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  UtensilsCrossed, Coffee, IceCream, Beer, Cake, ChefHat, Pizza,
  Smartphone, BarChart3, ReceiptText, Wallet, Users2, ClipboardList,
  Check, ArrowRight, Menu, ShieldCheck, MessageCircle, Play, X,
  CircleAlert, ClipboardX, Search, LineChart, PlayCircle,
} from 'lucide-react';

/* ---------- Configuração fácil de editar ---------- */
const WHATSAPP_NUMBER = ''; // ex.: '5599999999999' — deixe vazio para ocultar o CTA
const WHATSAPP_MSG = 'Olá! Gostaria de saber mais sobre o MesaChef.';
const DEMO_VIDEO_URL = ''; // ex.: 'https://www.youtube.com/embed/xxxx'
const SCREENSHOTS = {
  hero: '/landing/screenshots/hero.webp',
  mesas: '/landing/screenshots/mesas.webp',
  pedido: '/landing/screenshots/pedido.webp',
  cozinha: '/landing/screenshots/cozinha.webp',
  caixa: '/landing/screenshots/caixa.webp',
  dashboard: '/landing/screenshots/dashboard.webp',
};

/* ---------- Tipos e helpers ---------- */
interface LandingPlan {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  monthly_price: number;
  trial_days: number;
  is_featured: boolean;
  display_order: number;
}
const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const whatsAppHref = WHATSAPP_NUMBER
  ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MSG)}`
  : '';

/* ---------- Dados de conteúdo ---------- */
const navLinks = [
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#funcionalidades', label: 'Funcionalidades' },
  { href: '#para-quem', label: 'Para quem é' },
  { href: '#preco', label: 'Preço' },
  { href: '#faq', label: 'Dúvidas' },
];

const trustItems = [
  { icon: Check, label: '30 dias grátis' },
  { icon: Wallet, label: 'R$ 97 por mês' },
  { icon: ShieldCheck, label: 'Todas as funcionalidades incluídas' },
  { icon: MessageCircle, label: 'Suporte pelo WhatsApp' },
];

const problems = [
  { icon: ClipboardX, title: 'Pedido que não chegou à cozinha', body: 'Comandas em papel se perdem e atrasam a produção.' },
  { icon: ReceiptText, title: 'Conta fechada com item faltando', body: 'Item lançado por engano no papel escapa no fechamento.' },
  { icon: Search, title: 'Garçom procurando a comanda', body: 'Tempo perdido buscando informação em vez de atender.' },
  { icon: LineChart, title: 'Gestor sem saber o resultado do dia', body: 'Sem visão do faturamento, tomar decisão vira palpite.' },
];

const steps = [
  { n: 1, title: 'Pedido registrado', body: 'O garçom lança os itens diretamente pelo celular ou tablet.' },
  { n: 2, title: 'Cozinha atualizada', body: 'Os pedidos chegam automaticamente ao setor responsável.' },
  { n: 3, title: 'Produção acompanhada', body: 'A equipe acompanha o que está novo, em preparo ou pronto.' },
  { n: 4, title: 'Fechamento seguro', body: 'O caixa visualiza todos os itens antes de concluir o pagamento.' },
];

const benefits = [
  'Atendimento mais rápido',
  'Menos erros nos pedidos',
  'Cozinha mais organizada',
  'Fechamento mais seguro',
  'Operação acompanhada em tempo real',
  'Informações melhores para decisões',
];

const productBlocks = [
  {
    key: 'salao',
    title: 'Todo o salão em uma única tela.',
    desc: 'Visualize mesas livres, ocupadas ou reservadas, registre pedidos e acompanhe o consumo sem depender de comandas de papel.',
    items: ['Visualização em tempo real', 'Pedidos pelo celular ou tablet', 'Identificação do cliente', 'Histórico dos itens da mesa', 'Fechamento organizado'],
    img: SCREENSHOTS.mesas,
    caption: 'Salão e comandas',
  },
  {
    key: 'cozinha',
    title: 'A cozinha recebe o pedido sem depender de recados.',
    desc: 'Os pedidos são enviados automaticamente para os setores responsáveis, permitindo que cozinha, bar e expedição trabalhem com mais clareza.',
    items: ['Fila de produção', 'Separação por setor', 'Status do pedido', 'Menos pedidos esquecidos', 'Melhor acompanhamento do tempo'],
    img: SCREENSHOTS.cozinha,
    caption: 'Painel da cozinha (KDS)',
  },
  {
    key: 'caixa',
    title: 'Feche a conta com todos os itens registrados.',
    desc: 'Consulte o consumo, aplique as formas de pagamento disponíveis e conclua o atendimento com mais segurança.',
    items: ['Conferência dos itens', 'Múltiplas formas de pagamento', 'Histórico de movimentações', 'Menos divergências', 'Fechamento mais rápido'],
    img: SCREENSHOTS.caixa,
    caption: 'Fechamento no caixa',
  },
  {
    key: 'gestao',
    title: 'Saiba o que está acontecendo no seu negócio.',
    desc: 'Acompanhe faturamento, pedidos, produtos mais vendidos e outros indicadores importantes em um painel simples.',
    items: ['Faturamento do período', 'Quantidade de pedidos', 'Ticket médio', 'Produtos mais vendidos', 'Indicadores da operação'],
    img: SCREENSHOTS.dashboard,
    caption: 'Dashboard de gestão',
  },
];

const audience = [
  { icon: UtensilsCrossed, title: 'Restaurantes e bares', body: 'Mesas, comandas, garçons, cozinha e fechamento.' },
  { icon: ChefHat, title: 'Hamburguerias e lanchonetes', body: 'Pedidos rápidos, balcão, adicionais e produção.' },
  { icon: Coffee, title: 'Cafeterias e docerias', body: 'Comandas, produtos, mesas e controle de vendas.' },
  { icon: Pizza, title: 'Pizzarias', body: 'Tamanhos, sabores, adicionais, setores e pedidos.' },
  { icon: IceCream, title: 'Outros negócios de alimentação', body: 'Operações de salão, balcão, retirada ou delivery local.' },
];

const beforeItems = [
  'Comandas em papel',
  'Informações espalhadas',
  'Pedido repassado verbalmente',
  'Fechamento demorado',
  'Pouca visão dos resultados',
];
const afterItems = [
  'Pedidos centralizados',
  'Setores conectados',
  'Produção atualizada',
  'Fechamento organizado',
  'Indicadores em uma tela',
];

const priceItems = [
  'Gestão de mesas e comandas',
  'Pedidos e setores de produção',
  'Cozinha e expedição',
  'Caixa e fechamento',
  'Dashboard e relatórios',
  'Usuários e permissões',
  'Suporte incluído',
  'Sem taxa de implantação',
  'Sem cobrança por módulo',
  'Cancelamento sem multa',
];

const faqs = [
  { q: 'Preciso instalar alguma coisa?', a: 'Não. O MesaChef funciona direto pelo navegador, sem instalação.' },
  { q: 'O MesaChef funciona no celular e no tablet?', a: 'Sim. A interface é otimizada para uso em celular, tablet e computador.' },
  { q: 'Preciso cadastrar cartão para testar?', a: 'Não. Você pode testar por 30 dias sem cadastrar cartão de crédito.' },
  { q: 'Posso utilizar em mais de um dispositivo?', a: 'Sim. Os usuários da sua equipe podem acessar simultaneamente em vários aparelhos.' },
  { q: 'Como funciona o período gratuito?', a: 'Ao criar sua conta, você tem 30 dias para usar todas as funcionalidades. Depois, basta escolher o plano para continuar.' },
  { q: 'O sistema funciona com impressora térmica?', a: 'Os pedidos podem ser visualizados em tela pelos setores. A impressão depende da compatibilidade do seu equipamento — fale com a equipe para validarmos seu caso.' },
  { q: 'Meus dados ficam seguros?', a: 'Os dados de cada estabelecimento ficam separados e protegidos, com acesso restrito por usuário.' },
  { q: 'Existe treinamento para minha equipe?', a: 'Sim. Oferecemos suporte durante o período de teste para ajudar sua equipe a começar.' },
  { q: 'Como funciona o suporte?', a: 'O suporte é feito pelo WhatsApp em horário comercial.' },
  { q: 'Posso cancelar quando quiser?', a: 'Sim. Você cancela pelo próprio painel, sem multa.' },
  { q: 'O que acontece depois dos 30 dias?', a: 'Você pode contratar o plano para continuar usando. Se não contratar, o acesso à operação é suspenso, mas seus dados permanecem.' },
  { q: 'Posso importar dados de outro sistema?', a: 'A importação depende do formato dos seus dados atuais. Fale com a equipe para avaliarmos juntos.' },
];

/* ---------- Componentes auxiliares ---------- */
function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 font-display text-xl font-semibold ${className}`}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <UtensilsCrossed className="h-4 w-4" />
      </span>
      MesaChef
    </span>
  );
}

function ScreenshotFrame({
  src, alt, caption, priority = false,
}: { src: string; alt: string; caption: string; priority?: boolean }) {
  const [errored, setErrored] = useState(false);
  return (
    <figure className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-elevated)]">
      <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/40 px-4 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="ml-3 truncate text-xs text-muted-foreground">{caption}</span>
      </div>
      <div className="relative aspect-[16/10] bg-muted/30">
        {!errored ? (
          <img
            src={src}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            onError={() => setErrored(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Demonstração
            </span>
            <p className="text-sm text-muted-foreground">
              Screenshot real do MesaChef será exibido aqui.
            </p>
          </div>
        )}
      </div>
    </figure>
  );
}

function VideoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Demonstração do MesaChef"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Fechar demonstração"
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-background/90 text-foreground hover:bg-background"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="relative aspect-video bg-muted">
          {DEMO_VIDEO_URL ? (
            <iframe
              src={DEMO_VIDEO_URL}
              title="Demonstração do MesaChef"
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <PlayCircle className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                O vídeo de demonstração será disponibilizado em breve.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Página ---------- */
export default function Landing() {
  const [plan, setPlan] = useState<LandingPlan | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const [showStickyCTA, setShowStickyCTA] = useState(false);
  const heroRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('plans')
        .select('id,name,slug,short_description,monthly_price,trial_days,is_featured,display_order')
        .eq('status', 'ativo')
        .eq('show_on_landing_page', true)
        .order('display_order', { ascending: true });
      const list = (data ?? []) as LandingPlan[];
      setPlan(list.find((p) => p.is_featured) ?? list[0] ?? null);
    })();
  }, []);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setShowStickyCTA(!entry.isIntersecting),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const planSlug = plan?.slug ?? 'completo';
  const priceLabel = plan ? formatBRL(Number(plan.monthly_price)) : 'R$ 97,00';
  const trialDays = plan?.trial_days ?? 30;

  const ctaTrial = (extraClasses = '') => (
    <Button asChild size="lg" className={extraClasses}>
      <Link to={`/contratar/${planSlug}`}>Testar grátis por {trialDays} dias</Link>
    </Button>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'MesaChef',
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web',
              offers: {
                '@type': 'Offer',
                price: '97.00',
                priceCurrency: 'BRL',
              },
              description:
                'Sistema para restaurantes, bares e lanchonetes. Controle mesas, comandas, cozinha, caixa e resultados.',
            },
            {
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: faqs.map((f) => ({
                '@type': 'Question',
                name: f.q,
                acceptedAnswer: { '@type': 'Answer', text: f.a },
              })),
            },
          ]),
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-5 py-3">
          <Link to="/" aria-label="MesaChef — Início"><Logo /></Link>

          <nav className="hidden gap-7 text-sm md:flex" aria-label="Navegação principal">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="text-muted-foreground transition-colors hover:text-foreground">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Button asChild variant="ghost" size="sm"><Link to="/login">Entrar</Link></Button>
            <Button asChild size="sm">
              <Link to={`/contratar/${planSlug}`}>Testar grátis</Link>
            </Button>
          </div>

          {/* Mobile */}
          <div className="flex items-center gap-2 md:hidden">
            <Button asChild size="sm">
              <Link to={`/contratar/${planSlug}`}>Testar grátis</Link>
            </Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Abrir menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetHeader>
                  <SheetTitle><Logo /></SheetTitle>
                </SheetHeader>
                <nav className="mt-6 flex flex-col gap-1" aria-label="Menu">
                  {navLinks.map((l) => (
                    <a key={l.href} href={l.href} className="rounded-md px-3 py-2 text-base text-foreground hover:bg-muted">
                      {l.label}
                    </a>
                  ))}
                  <Link to="/login" className="rounded-md px-3 py-2 text-base text-foreground hover:bg-muted">
                    Entrar
                  </Link>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section ref={heroRef} className="relative overflow-hidden border-b border-border/60">
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-5 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16 lg:py-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-primary" />
              {trialDays} dias grátis, sem cartão de crédito
            </span>
            <h1 className="mt-5 font-display text-[2rem] font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.25rem]">
              Seu restaurante funcionando <span className="text-primary">sem papel</span>, pedidos perdidos e retrabalho.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Controle mesas, comandas, cozinha, caixa e resultados em um único sistema, acessível pelo celular, tablet ou computador.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {ctaTrial()}
              <Button variant="outline" size="lg" onClick={() => setVideoOpen(true)}>
                <Play className="h-4 w-4" /> Ver o sistema funcionando
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Sem cartão de crédito • Configuração simples • Cancele quando quiser
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Plano completo por <strong className="text-foreground">{priceLabel}/mês</strong> após o período gratuito.
            </p>
          </div>

          <div className="relative">
            <ScreenshotFrame
              src={SCREENSHOTS.hero}
              alt="Painel do MesaChef mostrando mesas, pedidos e cozinha"
              caption="MesaChef — visão da operação"
              priority
            />
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section aria-label="Vantagens principais" className="border-b border-border/60 bg-muted/30">
        <div className="mx-auto grid max-w-[1200px] grid-cols-2 gap-4 px-5 py-5 text-sm md:grid-cols-4">
          {trustItems.map((t) => (
            <div key={t.label} className="flex items-center gap-2 text-muted-foreground">
              <t.icon className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-foreground">{t.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Problema */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-[1200px] px-5 py-20">
          <div className="max-w-3xl">
            <h2 className="font-display text-3xl font-semibold leading-tight md:text-[2.25rem]">
              Quando a operação não está conectada, o prejuízo aparece em pequenos erros todos os dias.
            </h2>
            <p className="mt-4 max-w-2xl text-muted-foreground">
              Pedidos perdidos, comandas difíceis de entender, demora no fechamento e falta de informações prejudicam o atendimento e consomem o tempo da equipe.
            </p>
          </div>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {problems.map((p) => (
              <li key={p.title} className="rounded-xl border border-border/60 bg-card p-5">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-muted text-foreground">
                  <p.icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-semibold">{p.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="border-b border-border/60 bg-muted/20">
        <div className="mx-auto max-w-[1200px] px-5 py-20">
          <div className="max-w-3xl">
            <h2 className="font-display text-3xl font-semibold leading-tight md:text-[2.25rem]">
              Do pedido ao fechamento, todos trabalham na mesma operação.
            </h2>
          </div>
          <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <li key={s.n} className="rounded-xl border border-border/60 bg-card p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-primary font-display text-sm font-semibold text-primary-foreground">
                    {s.n}
                  </span>
                  <h3 className="font-semibold">{s.title}</h3>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Benefícios */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-[1200px] px-5 py-20">
          <h2 className="max-w-3xl font-display text-3xl font-semibold leading-tight md:text-[2.25rem]">
            Menos confusão na operação. Mais controle para o seu negócio.
          </h2>
          <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((b) => (
              <li key={b} className="flex items-start gap-3 text-base">
                <Check className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Blocos de produto */}
      <section id="funcionalidades" className="border-b border-border/60 bg-muted/20">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-20 px-5 py-20">
          {productBlocks.map((b, i) => (
            <div
              key={b.key}
              className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-14 ${i % 2 === 1 ? 'lg:[&>*:first-child]:order-2' : ''}`}
            >
              <div>
                <h3 className="font-display text-2xl font-semibold leading-tight md:text-3xl">{b.title}</h3>
                <p className="mt-4 text-muted-foreground">{b.desc}</p>
                <ul className="mt-6 grid gap-2 sm:grid-cols-2">
                  {b.items.map((it) => (
                    <li key={it} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <ScreenshotFrame src={b.img} alt={b.caption} caption={b.caption} />
            </div>
          ))}
        </div>
      </section>

      {/* Para quem é */}
      <section id="para-quem" className="border-b border-border/60">
        <div className="mx-auto max-w-[1200px] px-5 py-20">
          <h2 className="max-w-3xl font-display text-3xl font-semibold leading-tight md:text-[2.25rem]">
            Feito para a rotina real de quem trabalha com alimentação.
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {audience.map((a) => (
              <div key={a.title} className="rounded-xl border border-border/60 bg-card p-5">
                <a.icon className="h-6 w-6 text-primary" aria-hidden="true" />
                <h3 className="mt-3 font-semibold">{a.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Antes / depois */}
      <section className="border-b border-border/60 bg-muted/20">
        <div className="mx-auto max-w-[1200px] px-5 py-20">
          <h2 className="max-w-3xl font-display text-3xl font-semibold leading-tight md:text-[2.25rem]">
            O que muda no dia a dia do restaurante.
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-card p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sem o MesaChef</h3>
              <ul className="mt-4 space-y-2 text-sm">
                {beforeItems.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-muted-foreground">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-primary/30 bg-card p-6 shadow-[var(--shadow-card)]">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">Com o MesaChef</h3>
              <ul className="mt-4 space-y-2 text-sm">
                {afterItems.map((a) => (
                  <li key={a} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Demonstração */}
      <section id="demonstracao" className="border-b border-border/60">
        <div className="mx-auto max-w-[1200px] px-5 py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div>
              <h2 className="font-display text-3xl font-semibold leading-tight md:text-[2.25rem]">
                Veja o MesaChef funcionando.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Uma demonstração curta do fluxo real: da abertura da mesa ao fechamento do caixa e à visualização dos resultados.
              </p>
              <div className="mt-6">
                <Button size="lg" onClick={() => setVideoOpen(true)}>
                  <Play className="h-4 w-4" /> Assistir à demonstração
                </Button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setVideoOpen(true)}
              className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card text-left shadow-[var(--shadow-elevated)] focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Abrir demonstração do MesaChef"
            >
              <div className="relative aspect-video">
                <ScreenshotFrame
                  src={SCREENSHOTS.hero}
                  alt="Prévia da demonstração do MesaChef"
                  caption="Demonstração"
                />
                <span className="absolute inset-0 grid place-items-center bg-black/20 opacity-90 transition group-hover:opacity-100">
                  <span className="grid h-16 w-16 place-items-center rounded-full bg-background/95 text-primary shadow-lg">
                    <Play className="h-6 w-6" />
                  </span>
                </span>
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* Preço */}
      <section id="preco" className="border-b border-border/60 bg-muted/20">
        <div className="mx-auto max-w-[1200px] px-5 py-20">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="font-display text-3xl font-semibold md:text-[2.25rem]">Um plano completo. Sem surpresas.</h2>
            <p className="mt-3 text-muted-foreground">
              Teste todas as funcionalidades por {trialDays} dias, sem cadastrar cartão.
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-2xl overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-elevated)]">
            <div className="border-b border-border/60 p-8">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-2xl font-semibold">MesaChef Completo</h3>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  {trialDays} dias grátis
                </span>
              </div>
              <div className="mt-6 flex items-baseline gap-2">
                <span className="font-display text-5xl font-semibold">{priceLabel}</span>
                <span className="text-muted-foreground">/mês</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Menos de R$ 3,25 por dia para manter sua operação conectada.
              </p>
            </div>
            <div className="grid gap-3 p-8 sm:grid-cols-2">
              {priceItems.map((it) => (
                <div key={it} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>{it}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border/60 bg-muted/30 p-6">
              <Button asChild size="lg" className="w-full">
                <Link to={`/contratar/${planSlug}`}>Começar meu teste gratuito</Link>
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Sem cartão de crédito. Cancele quando quiser.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-b border-border/60">
        <div className="mx-auto max-w-3xl px-5 py-20">
          <h2 className="font-display text-3xl font-semibold md:text-[2.25rem]">Perguntas frequentes</h2>
          <div className="mt-10 divide-y divide-border/60 rounded-xl border border-border/60 bg-card">
            {faqs.map((f) => (
              <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-center justify-between gap-4 font-medium">
                  <span>{f.q}</span>
                  <span aria-hidden="true" className="text-muted-foreground transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="border-b border-border/60 bg-primary text-primary-foreground">
        <div className="mx-auto max-w-[1200px] px-5 py-16 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <h2 className="font-display text-3xl font-semibold leading-tight md:text-[2.25rem]">
                Organize hoje a operação que você deseja expandir amanhã.
              </h2>
              <p className="mt-3 max-w-2xl text-primary-foreground/80">
                Teste o MesaChef completo por {trialDays} dias, sem cartão de crédito.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg" variant="secondary">
                <Link to={`/contratar/${planSlug}`}>Testar o MesaChef grátis</Link>
              </Button>
              {whatsAppHref && (
                <a
                  href={whatsAppHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary-foreground/90 underline-offset-4 hover:underline"
                >
                  <MessageCircle className="h-4 w-4" /> Falar pelo WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-background">
        <div className="mx-auto grid max-w-[1200px] gap-8 px-5 py-12 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              Sistema brasileiro para gestão de restaurantes, bares, lanchonetes e outros negócios de alimentação.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold">Produto</h4>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><a href="#funcionalidades" className="hover:text-foreground">Funcionalidades</a></li>
              <li><a href="#preco" className="hover:text-foreground">Preço</a></li>
              <li><a href="#faq" className="hover:text-foreground">Dúvidas</a></li>
              <li><Link to="/login" className="hover:text-foreground">Entrar</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold">Contato</h4>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>Suporte: suporte@mesachef.com.br</li>
              {whatsAppHref && (
                <li>
                  <a href={whatsAppHref} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                    Falar pelo WhatsApp
                  </a>
                </li>
              )}
              <li><Link to="/confianca" className="hover:text-foreground">Política de privacidade e termos</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border/60">
          <div className="mx-auto max-w-[1200px] px-5 py-5 text-xs text-muted-foreground">
            © {new Date().getFullYear()} MesaChef. Todos os direitos reservados.
          </div>
        </div>
      </footer>

      {/* Sticky CTA mobile */}
      {showStickyCTA && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 p-3 backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-[1200px] items-center gap-2">
            <Button asChild className="flex-1">
              <Link to={`/contratar/${planSlug}`}>Testar grátis</Link>
            </Button>
            {whatsAppHref && (
              <a
                href={whatsAppHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Falar pelo WhatsApp"
                className="grid h-10 w-10 place-items-center rounded-md border border-border bg-card text-primary"
              >
                <MessageCircle className="h-5 w-5" />
              </a>
            )}
          </div>
        </div>
      )}

      <VideoModal open={videoOpen} onClose={() => setVideoOpen(false)} />
    </div>
  );
}
