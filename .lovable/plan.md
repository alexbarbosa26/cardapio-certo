## Visão geral

Vou implementar dois blocos grandes e interligados, mantendo o padrão visual atual (cards off-white, badges, mobile-first) e o isolamento por `company_id`. Por ser uma entrega extensa, proponho dividir em **3 fases entregáveis**, cada uma já funcional. Confirme a ordem ou peça para mesclar.

---

## Fase 1 — Pagamentos avançados na Mesa

### Banco
- Nova tabela `order_payment_allocations` (vincula um `payment` a `order_item` com `quantity_paid` e `amount_allocated`).
- Adicionar em `order_items`: `paid_quantity numeric default 0`, `payment_status` (`pendente|parcial|pago`) calculado.
- Adicionar em `payments`: `status` (`ativo|cancelado`), `canceled_at`, `canceled_by`, `received_amount`, `change_amount`, `person_label` (para divisão).
- Adicionar em `orders`: `paid_amount numeric default 0` (atualizado por trigger ao inserir/cancelar pagamentos).
- Trigger para recalcular `paid_amount` da order e `paid_quantity` dos itens.
- RLS: tudo escopo `company_id` + admin para estorno.

### UI — reescrita do `CheckoutDialog`
Tabs no topo:
1. **Total** — fluxo atual melhorado.
2. **Dividir igualmente** — input nº pessoas, lista de "Pessoa 1..N" com valor pré-calculado (último absorve centavos), método por pessoa, botão "Registrar pagamento" individual.
3. **Por itens** — lista de itens com checkbox/stepper de quantidade ainda não paga, total selecionado em tempo real, método, registrar.
4. **Parcial (valor livre)** — input de valor + método.

Sempre visíveis no rodapé: **Total / Pago / Falta**. Botão **Finalizar mesa** só habilita quando `pending = 0`. Lista de **Histórico de pagamentos** com botão de estornar (admin).

Cálculo de taxa cartão e troco mantidos.

---

## Fase 2 — Módulo Comandas (PDV leve)

### Banco
- `customer_tabs` (id, company_id, tab_number sequencial por empresa, customer_name, status, opened_by, closed_by, opened_at, closed_at, subtotal, service_fee_percentage, service_fee_amount, discount, total, paid_amount, notes).
- `tab_items` (id, company_id, tab_id, product_id nullable, product_name, category_name, item_type `fixo|peso|manual`, quantity, unit_price, price_per_kg, weight_grams, total_price, notes, created_by, canceled_at).
- `tab_payments` (mesma estrutura de `payments` adaptada, com `tab_id`).
- Alterar `products`: adicionar `is_weighted boolean default false`, `price_per_kg numeric`.
- Sequence `customer_tabs_number_seq` por company (função RPC).
- RLS em todas + realtime habilitado.

### UI
- Rota `/_app/comandas` — listagem com filtros (aberta, aguardando pagamento, paga, cancelada), busca por número, botão "Nova comanda".
- `ComandaSheet` — adicionar itens:
  - **Produto fixo**: busca/grade de produtos com preço fixo.
  - **Por peso**: select produto pesável → input gramas/kg → calcula automaticamente (ou valor direto da balança).
  - **Manual**: nome + valor.
  - Lista de itens com remover.
- `CheckoutTabDialog` — reaproveita as 4 abas de pagamento da mesa.
- Impressão via `printThermal` já existente (reusa template).
- Item no menu sidebar "Comandas".

### Produtos
- Editar `produtos.tsx` para marcar `is_weighted` + `price_per_kg`.
- Seed: criar categorias Sorvetes, Açaí, Cupuaçu, Bebidas + produtos exemplo (Sorvete/Açaí/Cupuaçu por kg, Água, Refrigerante).

---

## Fase 3 — Dashboard / Relatórios consolidados

- Cards no dashboard: comandas abertas, vendas de comandas hoje, ticket médio comanda, top categorias.
- Aba "Relatórios" expandida: filtros por período + origem (mesa/comanda) + categoria + forma de pagamento.
- Vendas de mesa **e** comandas alimentam o caixa aberto (registro em `payments`/`tab_payments` com `register_id`).

---

## Tecnicalidades

- Stack: TanStack Start + Supabase já configurados. Tudo via cliente browser + RLS (sem server functions novos).
- Triggers PL/pgSQL para manter `paid_amount` e `paid_quantity` consistentes (verdade no banco, não no front).
- Realtime nos canais novos (`customer_tabs`, `tab_items`, `tab_payments`).
- Componentes seguem design tokens existentes (`bg-card`, `border-border`, `font-display`).

---

## Pergunta antes de começar

Esta entrega é grande (~15-20 arquivos novos + 3 migrações). Quer que eu:

**(A)** Faça tudo de uma vez em uma única resposta longa (vai demorar e ficar mais difícil de revisar), ou
**(B)** Entregue **Fase 1 agora** (pagamentos avançados de mesa, que já cobre 10 dos 18 critérios de aceite) e nas próximas mensagens entregue Fase 2 e Fase 3?

Recomendo **(B)** — cada fase fica testável isoladamente e você valida o fluxo antes de seguir. Me confirme A ou B.
