# Plano: Base SaaS White Label — domínio único

Objetivo: transformar o MesaChef em SaaS multi-empresa real, **sem** subdomínios nem domínios próprios. Tudo acessado por `mesachef.com.br`, com identificação da empresa via `company_id` do usuário autenticado.

Esta é uma etapa grande. Sugiro entregar em **3 fases sequenciais**, cada uma testável de ponta a ponta. Cada fase termina com critérios de aceite verificáveis antes de iniciar a próxima.

---

## Fase 1 — Fundação: Super Admin, Planos, Assinaturas e Bloqueio

Foco: criar o esqueleto que permite vender o SaaS. Sem ela, nada do resto faz sentido.

### Banco de dados (migração única)

Novas tabelas:
- **`plans`** — `name, description, monthly_price, annual_price, max_users, max_tables, max_open_tabs, allow_tables_module, allow_tabs_module, allow_kitchen_module, allow_advanced_dashboard, status`.
- **`subscriptions`** — `company_id, plan_id, status (trialing|active|past_due|suspended|canceled|expired), billing_cycle, current_period_start, current_period_end, trial_ends_at, canceled_at, suspended_at, payment_provider, external_subscription_id, last_payment_status, next_billing_date`. Uma assinatura ativa por empresa (unique parcial).
- **`audit_logs`** — `actor_user_id, actor_role, company_id, action, entity_type, entity_id, old_value (jsonb), new_value (jsonb), created_at`.

Ajustes em tabelas existentes:
- **`companies`**: adicionar `trade_name` (já existe), `responsible_name, responsible_email, responsible_phone, city, state, secondary_color, accent_color`. Já tem `status`, `logo_url`, `primary_color`.
- **`app_role` enum**: adicionar `'super_admin'`.
- **`profiles`**: permitir `company_id` nulo (para super admins internos).
- **`current_company_id()`**: continua igual, mas super admin terá `company_id` nulo → não vê dados operacionais por RLS padrão.

### RLS / segurança

- Nova função `is_super_admin()` (SECURITY DEFINER, usa `has_role(auth.uid(),'super_admin')`).
- `plans`: SELECT autenticado; INSERT/UPDATE/DELETE só super admin.
- `subscriptions`: SELECT empresa própria OU super admin; mutações só super admin.
- `audit_logs`: SELECT só super admin (ou empresa própria nas ações relativas à própria empresa); INSERT via edge function.
- `companies`: adicionar política de SELECT/INSERT/UPDATE/DELETE para super admin (todas as empresas).
- `profiles` e `user_roles`: super admin pode gerenciar globalmente.
- `tables` (`public.tables`): manter `staff updates table status` mas continuar exigindo mesma empresa — já está OK.

### Edge function (estende `admin-users`)

Nova função **`admin-companies`** com ações:
- `create_company` — cria empresa, settings padrão, assinatura trial (14 dias), usuário admin inicial, role `admin`.
- `update_company` — dados, branding, status.
- `set_subscription` — define plano, status, datas.
- `suspend_company` / `reactivate_company` — atalho de status.

Toda ação registra em `audit_logs`. Validação: o caller precisa ter role `super_admin` (verificado via JWT + `has_role`).

### Frontend — Super Admin

Rotas novas (todas dentro de `BrowserRouter`, prefixo `/global`):
- `/global` → redireciona conforme role.
- `/global/dashboard` — métricas globais (contagem por status, total usuários, total pedidos).
- `/global/empresas` — lista + criar/editar/suspender/reativar.
- `/global/empresas/:id` — detalhe + assinatura + branding.
- `/global/planos` — CRUD de planos.
- `/global/assinaturas` — visão consolidada.
- `/global/auditoria` — lista de `audit_logs` com filtros.

Guards:
- `<RequireSuperAdmin>` — só `super_admin`.
- `<RequireCompanyAccess>` — usuário tem `company_id` E assinatura permite acesso (`active`/`trialing`); senão redireciona para `/assinatura-suspensa`.

Hook `useAuth` estendido: carrega assinatura ativa da empresa e expõe `subscriptionStatus`, `planLimits`, `isSuperAdmin`.

### Tela de bloqueio

`/assinatura-suspensa` — mensagem amigável + botão WhatsApp suporte + logout. Mostrada quando assinatura ≠ `active`/`trialing` para usuários de empresa.

### Seeds de demonstração

Via migração `INSERT … ON CONFLICT DO NOTHING`:
- Plano "Profissional" padrão.
- Super admin: `superadmin@mesachef.com.br / superadmin` (criar via edge function pós-deploy ou seed SQL com `auth.users`).
- Manter `admin@gmail.com / admin` e `staff@gmail.com / staff` já existentes.

### Critérios de aceite Fase 1
- Login como super admin → vai para `/global/dashboard`.
- Super admin cria empresa + admin inicial.
- Login do novo admin → vê apenas dados da própria empresa.
- Super admin suspende assinatura → admin é bloqueado em `/assinatura-suspensa` no próximo acesso.
- Reativar → acesso volta.
- `audit_logs` registra criação, suspensão e reativação.

---

## Fase 2 — White Label visual por empresa + Configurações expandidas

Foco: cada empresa enxerga sua marca dentro do mesmo domínio.

### Banco

- Estender `settings` (não criar `company_settings` separado — evita duplicação com `settings` atual):
  - `display_name, secondary_color, accent_color, enable_tables_module, enable_tabs_module, enable_printing, enable_service_fee, tab_numbering_mode (manual|auto), receipt_message, establishment_data (jsonb)`.

### Frontend

- Hook `useTenantBranding` — carrega logo + cores da empresa, injeta variáveis CSS (`--primary`, `--accent`, etc.) no `:root` após login.
- `AppLayout` mostra logo + nome da empresa configurada.
- Tela `/configuracoes` ganha abas: **Identidade** (logo, nome, cores), **Operação** (taxas, módulos, impressão), **Comprovante** (mensagem, dados estabelecimento).
- Rodapé discreto "Powered by MesaChef".
- Itens de menu condicionados a `settings.enable_*` E `plan.allow_*`.

### Critérios de aceite Fase 2
- Empresa A com logo azul, empresa B com logo verde — cada admin vê a sua sem mudar domínio.
- Desabilitar módulo de comandas no plano remove o item do menu.

---

## Fase 3 — Limites de plano, "Minha Assinatura", permissões granulares

Foco: amarrar plano às operações.

### Backend

- Triggers ou checks na edge `admin-users` para `max_users`.
- Trigger em `tables` INSERT para `max_tables`.
- Trigger em `customer_tabs` INSERT (status='aberta') para `max_open_tabs`.
- Erro amigável: `"Seu plano atual não permite adicionar mais X."`

### Frontend

- `/app/assinatura` (admin da empresa) — plano atual, status, vencimento, contadores de uso vs limite, botão "Falar com suporte".
- `/app/suporte` — WhatsApp/email + dados técnicos copiáveis.
- Camada `usePermissions()` baseada em role + plano. Componente `<Can permission="...">` para esconder ações.

### Reestruturação de rotas (opcional, requer cuidado)

Mover rotas atuais (`/mesas`, `/comandas` etc.) para prefixo `/app/*` conforme pedido. **Risco**: links existentes/bookmarks quebram. Sugiro manter rotas atuais como aliases que redirecionam para `/app/*` por 1–2 versões.

### Critérios de aceite Fase 3
- Plano com `max_users=3` impede criar 4º usuário com mensagem clara.
- Admin vê tela `/app/assinatura` com uso real.
- Staff sem permissão `manage_cash_register` não vê o item Caixa.

---

## Detalhes técnicos

**Stack mantida:** React 18 + Vite + React Router v6 + Supabase (Lovable Cloud) + Tailwind + shadcn. Sem mudança de framework.

**Migração de dados existentes:** todas as empresas atuais recebem assinatura `active` no plano "Profissional" via migração, para não quebrar nada.

**Roles:** `app_role` enum existente `('admin','staff')` ganha `'super_admin'`. `admin` continua sendo admin **da empresa** (não global). Documentar isso em `mem://`.

**Super admin sem company_id:** RLS atual usa `current_company_id()` que retorna NULL para ele → naturalmente não vê dados operacionais a menos que use telas `/global/*` que consultam via edge function com service role OU via policies específicas com `is_super_admin()`.

**Auditoria:** toda mutação sensível (criar/suspender empresa, alterar plano, alterar role) passa pela edge function que insere em `audit_logs` com `actor_user_id = auth.uid()`.

**Domínio único:** nenhum código lê `window.location.hostname` para roteamento. Identificação 100% via JWT → `profiles.company_id`.

---

## O que NÃO está incluído nesta etapa

- Cobrança real (Stripe/Mercado Pago/Asaas) — estrutura pronta, integração depois.
- "Acessar ambiente como" (impersonation de super admin) — fica para fase futura, exige cuidado de segurança.
- WhatsApp, NF-e, gateway de pagamento real.
- Permissões 100% customizáveis (granular por usuário) — perfis fixos por role + plano nesta etapa.

---

## Próximo passo

Confirme se posso começar pela **Fase 1** (Super Admin + Planos + Assinaturas + Bloqueio). É a base — sem ela as fases 2 e 3 não têm sentido. Cada fase tem ~1 migração + ~1 edge function + ~5–10 arquivos React, então fica testável de forma isolada.

Se quiser ajustar escopo antes de eu começar (ex.: pular auditoria, juntar fases, mudar nomes de rotas), me diga agora.
