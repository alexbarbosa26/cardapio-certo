
# Módulo Cardápio Digital + Delivery — Plano por fases

Implementação incremental. Reaproveita `products`, `option_groups`/`option_items`, `orders`/`order_items`, cozinha (KDS), impressão (`print-order`) e permissões existentes. Nada nos fluxos atuais é refatorado.

## Reutilização mapeada
- **Produtos e adicionais**: itens do cardápio referenciam `products` (FK), sem duplicar cadastro. Adicionais reaproveitam `option_groups`/`option_items` já usados no `order-sheet`.
- **Pedidos**: pedidos de delivery gravam em `orders` (`origin='digital_menu'`, `service_mode='delivery'|'pickup'`, sem `table_id`) e `order_items`. Isso preserva cozinha, caixa, histórico e impressão sem alterações.
- **Cozinha/Impressão**: só após aceite, o pedido ganha `status='aberto'` e aparece no KDS/impressão atuais. Antes disso fica em `status='aguardando_aceite'` (novo valor), invisível para cozinha.
- **Permissões**: nova permission `manage_digital_menu` (admin) e feature flag por empresa (`digital_menu_enabled`).

## Fase 1 (esta entrega) — Configuração + Cardápio público read-only

**Backend (migration)**
- `companies`: `digital_menu_enabled boolean`, `digital_menu_contracted boolean`, `slug text unique`.
- `digital_menu_settings` (1:1 com company): logo, capa, apresentação, telefone, whatsapp, endereço, instagram, cor primária, tempo médio preparo, pedido mínimo, taxa entrega fixa, entrega/retirada habilitadas, aceitando_pedidos, observações.
- `digital_menu_hours` (company_id, weekday 0-6, open bool, period1_start/end, period2_start/end).
- `digital_menu_categories` (company_id, name, description, sort_order, active).
- `digital_menu_items` (company_id, category_id, product_id nullable, name, description, price, image_url, active, available_delivery, featured, sort_order, extra_prep_min, sold_out).
- RLS: SELECT público (anon) apenas via função `public.get_public_menu(_slug text)` SECURITY DEFINER que devolve JSON já sanitizado (nada de exposição direta de tabelas ao anon). Admin/staff da empresa via `current_company_id()`.
- GRANTs conforme padrão do projeto; superadmin com bypass via `is_super_admin()`.

**Frontend admin — nova página `/cardapio`**
- Guard: exige `digital_menu_contracted && digital_menu_enabled` (senão card informativo).
- Abas: **Configurações**, **Horários**, **Categorias**, **Itens**, **Prévia & QR**.
- Categorias: CRUD + reordenar (setas up/down, sem lib nova).
- Itens: CRUD com seletor de produto existente (autocomplete), upload de imagem no bucket `branding` (reuso), toggle esgotado/ativo/destaque.
- Prévia: iframe/`<Link target=_blank>` para `/cardapio/:slug`. Botão copiar link + QR code (lib `qrcode` já leve, ~15KB) com download PNG.

**Frontend público — rota `/cardapio/:slug`** (fora de todos os guards)
- Página SSR-like via React Query: chama RPC `get_public_menu(slug)`.
- Layout mobile-first, sem gradiente exagerado: header com logo+nome+status aberto/fechado, busca, lista de categorias sticky, cards de item com foto opcional, badge "Esgotado" quando aplicável.
- Estado fechado: banner "Abrimos hoje às HH:MM" calculado do lado cliente a partir dos horários retornados.
- Sem carrinho/checkout ainda (Fase 2). Cliente vê o cardápio; botão "Fazer pedido" fica desabilitado com tooltip "Em breve".
- SEO: `<title>` e meta por empresa; Open Graph com logo.

**Arquivos**
- Migration única com tabelas + RLS + RPC.
- `src/pages/admin/CardapioDigital.tsx` + subcomponentes por aba em `src/components/cardapio/*`.
- `src/pages/public/CardapioPublico.tsx` (rota `/cardapio/:slug`, sem AppLayout).
- `src/lib/digital-menu.ts` (client helpers).
- `App.tsx`: rota admin dentro de `RequireCompanyAccess`, rota pública fora.
- Item de menu no `AppLayout` condicional à feature flag.

**Validação Fase 1**
- Empresa sem flag não vê o menu nem acessa `/cardapio` direto.
- Cardápio público carrega em <1s (dados via 1 RPC), responsivo, mostra fechado fora de horário.
- Nenhum impacto em produtos/pedidos/cozinha atuais (nenhum arquivo desses módulos alterado).

## Fases seguintes (apenas escopo, sem código agora)

- **Fase 2** — Carrinho, checkout público sem cadastro, cliente/endereço mínimo, taxa, formas de pagamento, troco, idempotência (chave `client_token` no insert), criação do `orders` com `status='aguardando_aceite'`.
- **Fase 3** — Tela `/cardapio/pedidos` (aguardando aceite / em andamento), botões Aceitar/Recusar, envio para KDS (muda status para `aberto` e insere `order_items` conforme fluxo atual), impressão reutilizando `print-order`.
- **Fase 4** — Página pública `/cardapio/:slug/pedido/:public_token` com timeline e polling leve (Realtime canal filtrado por token).
- **Fase 5** — Promoções destacadas + relatórios (join em `orders.origin='digital_menu'`).

## Fora de escopo
- Pagamento online real (Pix/cartão), taxa por bairro/CEP, integrações com iFood/WhatsApp Business, PWA/notificações push, criação de conta do cliente.

## Detalhes técnicos relevantes
- RPC pública `get_public_menu(_slug)` retorna `jsonb` com company básica + settings + hours + categorias com itens (nada de e-mail, telefone interno de staff, etc.).
- Slug validado por regex `^[a-z0-9-]{3,40}$`, unique index.
- Feature flag lida via `settings` já hidratado no `useAuth`? Não — vamos ler de `companies` em `TenantBrandingProvider` (já busca a empresa) para evitar nova ida ao banco.
- Cor primária do cardápio limitada a paleta segura (contraste AA via helper simples), sem permitir fundo branco em texto claro.
