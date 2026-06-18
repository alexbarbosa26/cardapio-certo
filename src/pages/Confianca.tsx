import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Lock, Database, UserCheck, Mail, FileText, ArrowLeft } from 'lucide-react';

const sections = [
  {
    icon: Lock,
    title: 'Acesso e autenticação',
    body:
      'O acesso à plataforma exige login com e-mail e senha. Senhas são armazenadas com hash gerenciado pelo provedor de autenticação e nunca em texto puro. Usuários inativos são imediatamente bloqueados no nível do servidor.',
  },
  {
    icon: ShieldCheck,
    title: 'Controle de permissões',
    body:
      'Cada usuário pertence a uma empresa e recebe um perfil (administrador ou operador). As regras de acesso são aplicadas no banco de dados via Row-Level Security, garantindo isolamento entre empresas mesmo em caso de falha na camada de aplicação.',
  },
  {
    icon: Database,
    title: 'Hospedagem e infraestrutura',
    body:
      'A aplicação é executada em infraestrutura gerenciada da Lovable Cloud, com banco de dados Postgres, backups automáticos e tráfego criptografado em trânsito (HTTPS/TLS).',
  },
  {
    icon: UserCheck,
    title: 'Dados coletados',
    body:
      'Coletamos apenas os dados necessários para operar o sistema: nome, e-mail e dados de uso da ferramenta (pedidos, mesas, comandas). Não comercializamos dados de clientes finais.',
  },
  {
    icon: FileText,
    title: 'Retenção e exclusão',
    body:
      'Os dados ficam disponíveis enquanto a assinatura estiver ativa. Em caso de cancelamento, o titular pode solicitar a exclusão dos dados associados à sua empresa através do contato abaixo.',
  },
  {
    icon: Mail,
    title: 'Contato de segurança',
    body:
      'Para reportar uma vulnerabilidade, suspeita de incidente ou solicitar exclusão de dados, escreva para o administrador da sua conta ou para o canal de suporte oficial do sistema.',
  },
];

export default function Confianca() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between py-4">
          <Link to="/" className="text-lg font-semibold">Cardápio Certo</Link>
          <Button asChild variant="ghost" size="sm">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl px-4 py-12">
        <div className="mb-10 text-center">
          <ShieldCheck className="mx-auto mb-4 h-12 w-12 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Segurança e privacidade
          </h1>
          <p className="mt-3 text-muted-foreground">
            Esta página é mantida pelo time do Cardápio Certo para responder
            dúvidas comuns sobre segurança, privacidade e tratamento de dados na
            plataforma. Não constitui certificação independente.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {sections.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="p-6">
              <div className="mb-3 flex items-center gap-3">
                <div className="rounded-md bg-primary/10 p-2 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-semibold">{title}</h2>
              </div>
              <p className="text-sm text-muted-foreground">{body}</p>
            </Card>
          ))}
        </div>

        <Card className="mt-8 p-6">
          <h2 className="mb-2 text-lg font-semibold">Responsabilidade compartilhada</h2>
          <p className="text-sm text-muted-foreground">
            A Lovable Cloud fornece a infraestrutura e os controles técnicos
            descritos acima. O administrador da conta é responsável por
            configurar usuários, perfis e práticas operacionais adequadas ao seu
            negócio (senhas fortes, revogação de acesso de ex-funcionários,
            revisão periódica de permissões).
          </p>
        </Card>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Última revisão desta página: junho de 2026.
        </p>
      </main>
    </div>
  );
}
