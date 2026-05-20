# MesaChef — Base comercial SaaS (checkout simulado)

Esta etapa entrega a camada comercial completa do MesaChef como SaaS multiempresa com personalização visual por cliente, **sem** integração real com gateways. Tudo passa por um `SimulatedPaymentProvider`, mas a arquitetura fica pronta para plugar um gateway real (Mercado Pago, InfinitePay, etc.) depois — sem mexer no núcleo.

Domínio único: `mesachef.com.br`. Sem subdomínios, sem domínio próprio por cliente. Isolamento por `company_id`.

---

## 1. Banco de dados (migration única)

**Ajustes na tabela `plans`** (estende a existente):
- `slug` (unique), `short_description`, `full_description`
- `trial_days` (default 7), `max_products`
- `allow_cash_register_module`, `allow_reports`, `allow_visual_customization`
- `support_level` (text: 'basico'|'padrao'|'prioritario')
- `is_featured`, `show_on_landing_page` (default true), `display_order`

**Ajustes na tabela `companies`**: `internal_notes`. Status passa a aceitar: `trial`, `ativa`, `inadimplente`, `suspensa`, `cancelada`, `bloqueada`.

**Ajustes na tabela `subscriptions`**:
- `amount` (numeric), `trial_starts_at`, `cancellation_reason`, `cancel_at_period_end` (bool)
- enum `subscription_status` ganha `pending_payment`, `failed` (mantém `trialing`, `active`, `past_due`, `suspended`, `canceled`, `expired`)

**Novas tabelas**:
- `payment_providers` — `name, slug, status, config jsonb, is_mock`
- `checkout_sessions` — `company_id, plan_id, subscription_id, provider, status (pending|paid|failed|expired), billing_cycle, amount, external_session_id, expires_at`
- `subscription_payments` — `company_id, subscription_id, checkout_session_id, provider, external_payment_id, amount, currency, status (pending|paid|failed|refunded), payment_method, paid_at, due_date, raw_response jsonb`
- `subscription_events` — `company_id, subscription_id, event_type, description, old_status, new_status, old_plan_id, new_plan_id, created_by_user_id`
- `webhook_events` — `provider, event_type, external_id, payload jsonb, processed, processed_at` (estrutura pronta, sem uso real ainda)

**RLS**:
- Planos: leitura pública (anon) apenas onde `status='ativo' AND show_on_landing_page=true`; super admin gerencia tudo.
- `payment_providers`: leitura autenticada; gestão por super admin.
- `checkout_sessions`: cliente lê só pelo `id` da sessão (acesso público controlado por id não-adivinhável); super admin vê tudo.
- `subscription_payments`, `subscription_events`: empresa vê os próprios; super admin vê tudo.
- `webhook_events`: super admin.

**Seeds (via insert tool após migration)**:
- 1 `payment_providers` simulado (`slug='simulated'`, `is_mock=true`).
- 3 planos: Básico (R$49,90), Profissional (R$89,90, `is_featured=true`), Premium (R$149,90).

---

## 2. Arquitetura abstrata de pagamento

`src/lib/payments/types.ts` — contratos: `PaymentProvider` interface com `createCheckoutSession`, `approveMockPayment`, `markPending`, `reject`, `cancelSubscription`, `changePlan`, `handleWebhook`.

`src/lib/payments/simulated-provider.ts` — implementação que apenas grava em `checkout_sessions` / `subscription_payments` / `subscription_events` e atualiza `subscriptions` + `companies` via edge function.

`src/lib/payments/index.ts` — `getPaymentProvider(slug)` retorna o provider correto. Hoje só `'simulated'`.

**Edge function `billing`** (`verify_jwt = false` para etapas públicas de signup/checkout; valida internamente) com actions:
- `signup_and_checkout` (público) — cria empresa + admin user + subscription `trialing` + checkout_session.
- `simulate_payment` (público via session id) — `approve | pending | reject`.
- `change_plan` (auth, admin da empresa).
- `cancel_subscription` (auth, admin da empresa).
- `reactivate_subscription` (auth).
- Toda mutação grava `subscription_events` + `audit_logs`.

Toda a regra de pagamento fica **na edge function + provider**, nunca espalhada em componentes.

---

## 3. Frontend — rotas públicas

- `/` — **Landing page** (`src/pages/Landing.tsx`): hero, benefícios, para quem é, **planos dinâmicos** carregados do banco (apenas `status='ativo' AND show_on_landing_page=true`, ordenados por `display_order`), FAQ, rodapé. Design limpo SaaS, fundo claro, sem gradiente roxo genérico. Header com link "Entrar" → `/login` e CTA "Começar agora" → `#planos`.
- `/contratar/:slug` (`src/pages/Contratar.tsx`) — formulário (empresa, responsável, e-mail, senha, telefone, cidade/UF, ciclo mensal/anual). Submete em `billing.signup_and_checkout`, redireciona para `/checkout/:sessionId`.
- `/checkout/:sessionId` (`src/pages/Checkout.tsx`) — resumo + 3 botões: **Aprovar**, **Deixar pendente**, **Recusar**. Após aprovado → redireciona para `/login` com aviso de sucesso.

**Rota `/`** atualmente é `IndexRedirect`. Vira: se logado → mantém redirect; se anônimo → renderiza `<Landing />` (em vez de mandar para `/login`).

---

## 4. Frontend — painel super admin

- `/global/planos` reescrito como CRUD completo: tabela + diálogo de criar/editar com todos os campos novos, toggles para módulos permitidos, `is_featured`, `show_on_landing_page`, `display_order`. Botões ativar/desativar, excluir (bloqueado se há assinatura).
- `/global/empresas` ganha edição completa (todos os campos da `companies` + `internal_notes`), histórico de pagamentos simulados, eventos de assinatura.

---

## 5. Frontend — admin da empresa

`src/pages/MinhaAssinatura.tsx` (já existe) é expandida com:
- Lista de planos disponíveis para **trocar** (chama `billing.change_plan`).
- Botão **Cancelar assinatura** (dialog com motivo, opção `cancel_at_period_end`).
- Botão **Reativar** quando aplicável.
- Histórico de `subscription_payments` e `subscription_events`.
- Bloqueio de downgrade quando uso atual excede limites do novo plano (validação cliente + servidor).

`src/pages/AssinaturaSuspensa.tsx` já existe — ajustada para cobrir todos os status bloqueantes (`suspended`, `canceled` pós-período, `expired`, `pending_payment` quando configurado para bloquear) com CTAs "Ver planos" / "Falar com suporte".

`RequireCompanyAccess` em `route-guards.tsx` passa a considerar os novos status.

---

## 6. Permissões / hook

`use-permissions.tsx` ganha `manage_subscription` (admin da empresa). Staff continua sem acesso a `/assinatura`. Super admin já tem rota separada.

---

## 7. Auditoria

Toda action da edge function `billing` chama insert em `audit_logs` + `subscription_events` (já existe pattern em `admin-companies`).

---

## Detalhes técnicos

**Arquivos novos**:
```
supabase/migrations/<ts>_saas_commercial_base.sql
supabase/functions/billing/index.ts
src/lib/payments/types.ts
src/lib/payments/simulated-provider.ts
src/lib/payments/index.ts
src/lib/billing.ts                 (wrapper functions.invoke)
src/pages/Landing.tsx
src/pages/Contratar.tsx
src/pages/Checkout.tsx
src/components/landing/*           (Hero, Benefits, Plans, FAQ, Footer)
```

**Arquivos editados**:
```
src/App.tsx                        (rotas públicas /, /contratar/:slug, /checkout/:id)
src/pages/Index.tsx                (renderiza Landing para anônimo)
src/pages/global/GlobalPlanos.tsx  (CRUD completo)
src/pages/global/GlobalEmpresas.tsx (edição completa + histórico)
src/pages/MinhaAssinatura.tsx      (alterar plano, cancelar, histórico)
src/pages/AssinaturaSuspensa.tsx   (status novos)
src/components/route-guards.tsx    (status novos)
src/hooks/use-auth.tsx             (isCompanyAccessAllowed considera novos status)
supabase/config.toml               (functions.billing)
```

**Seeds**: feitas via `supabase--insert` após a migration ser aprovada (planos + provider simulado).

**Fora de escopo** (conforme bloco 16): qualquer SDK de gateway real, chaves de API de gateway, recorrência automática real, webhooks reais, domínio/subdomínio por cliente.

---

## Critérios de aceite

Todos os 28 itens do BLOCO 15 são cobertos por esta arquitetura. Após o merge, é possível navegar `/` → escolher plano → criar empresa → simular pagamento aprovado → logar → acessar `/assinatura` → trocar plano → cancelar, com tudo isolado por `company_id` e auditado.

