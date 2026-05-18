
# Migração TanStack Start → Vite React SPA (cPanel)

## Resultado esperado

- `npm run build` gera apenas `dist/index.html` + `dist/assets/*` (mais favicon e demais estáticos), pronto para upload em `public_html` do cPanel.
- Sem `dist/server`, `server/index.js`, `wrangler.jsonc`, Cloudflare Worker ou SSR.
- App continua usando React 19 + TS + Tailwind v4 + shadcn/ui + Supabase + React Query.
- Todas as telas atuais funcionam (login, dashboard, mesas, comandas, cozinha, caixa, produtos, grupos-opcoes, configurações, relatórios, usuários).
- Impressão térmica 58/80mm e `PrintPreviewDialog` continuam funcionando (são puro browser, sem dependência de SSR).
- Multi-tenant e RLS preservados — Supabase client direto com a anon/publishable key.

## Arquitetura final

```text
src/
  main.tsx                 ← novo entry (ReactDOM.createRoot)
  App.tsx                  ← <BrowserRouter> + providers (QueryClient, Tooltip, Toaster, AuthProvider)
  routes.tsx               ← tabela de <Routes>/<Route> do react-router-dom
  pages/
    Login.tsx              ← migrado de routes/login.tsx
    Index.tsx              ← migrado de routes/index.tsx (redirect)
    AppLayout.tsx          ← migrado de routes/_app.tsx (sidebar + Outlet)
    Mesas.tsx, Comandas.tsx, Cozinha.tsx, Caixa.tsx, Dashboard.tsx,
    Produtos.tsx, GruposOpcoes.tsx, Configuracoes.tsx,
    Relatorios.tsx, Usuarios.tsx, NotFound.tsx
  hooks/
    use-auth.tsx           ← AuthProvider + useAuth (Supabase onAuthStateChange)
  lib/
    admin-users.ts         ← chama a Edge Function via supabase.functions.invoke
    (admin-users.functions.ts REMOVIDO)
  integrations/supabase/
    client.ts              ← mantido (já existe)
    (auth-attacher.ts, auth-middleware.ts, client.server.ts REMOVIDOS)
  components/              ← mantidos (UI, dialogs, print-preview)
  styles.css               ← mantido
index.html                 ← novo (raiz do projeto, padrão Vite SPA)
vite.config.ts             ← @vitejs/plugin-react + @tailwindcss/vite + tsconfig-paths
.env.example               ← VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
.htaccess (em public/)     ← rewrite SPA p/ cPanel/Apache
supabase/functions/admin-users/index.ts  ← Edge Function para CRUD de usuários
```

## Passos da migração

### 1. Limpeza de dependências e config

Remover: `@tanstack/react-start`, `@tanstack/react-router`, `@tanstack/router-plugin`, `@cloudflare/vite-plugin`, `@lovable.dev/vite-tanstack-config`.
Adicionar: `react-router-dom@^6`.

Reescrever `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  build: { outDir: "dist", emptyOutDir: true },
});
```

Apagar: `src/server.ts`, `src/start.ts`, `src/router.tsx`, `src/routeTree.gen.ts`, `wrangler.jsonc`, `worker-configuration.d.ts` (se existirem), `app.config.ts`.

### 2. Novo `index.html` na raiz + `src/main.tsx`

`index.html` padrão Vite com `<div id="root">` e `<script type="module" src="/src/main.tsx">`.
`main.tsx` faz `createRoot(...).render(<App />)`.

### 3. App.tsx (providers + router)

```tsx
<QueryClientProvider client={qc}>
  <TooltipProvider>
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster />
      </BrowserRouter>
    </AuthProvider>
  </TooltipProvider>
</QueryClientProvider>
```

### 4. Conversão de rotas

Cada `src/routes/<x>.tsx` vira `src/pages/<X>.tsx` exportando um componente normal.
`src/routes/_app.tsx` (layout com sidebar) vira `pages/AppLayout.tsx` e usa `<Outlet />` do `react-router-dom`.

`routes.tsx`:

```tsx
<Routes>
  <Route path="/login" element={<Login />} />
  <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
    <Route path="/" element={<Navigate to="/mesas" replace />} />
    <Route path="/mesas" element={<Mesas />} />
    <Route path="/comandas" element={<Comandas />} />
    <Route path="/cozinha" element={<Cozinha />} />
    <Route path="/caixa" element={<Caixa />} />
    <Route path="/dashboard" element={<RequireAdmin><Dashboard /></RequireAdmin>} />
    <Route path="/produtos" element={<RequireAdmin><Produtos /></RequireAdmin>} />
    <Route path="/grupos-opcoes" element={<RequireAdmin><GruposOpcoes /></RequireAdmin>} />
    <Route path="/configuracoes" element={<RequireAdmin><Configuracoes /></RequireAdmin>} />
    <Route path="/relatorios" element={<RequireAdmin><Relatorios /></RequireAdmin>} />
    <Route path="/usuarios" element={<RequireAdmin><Usuarios /></RequireAdmin>} />
  </Route>
  <Route path="*" element={<NotFound />} />
</Routes>
```

Substituições mecânicas em cada página:
- `import { createFileRoute } from "@tanstack/react-router"` → remover
- `export const Route = createFileRoute(...)({ component: X })` → `export default X`
- `<Link to="/x">` do TanStack → `<Link to="/x">` do `react-router-dom` (mesmo nome)
- `useNavigate`/`useLocation`/`useParams` → equivalentes do `react-router-dom`
- `Route.useParams()` → `useParams()`
- `Navigate` → do `react-router-dom`

### 5. Auth (sem server fn)

`use-auth.tsx` cria contexto que escuta `supabase.auth.onAuthStateChange` e expõe `{ user, profile, role, loading, signIn, signOut }`. `profile` e `role` são carregados via `supabase.from('profiles').select(...)` e `supabase.from('user_roles').select(...)` — RLS já restringe ao próprio usuário.

`RequireAuth` redireciona para `/login` se sem sessão. `RequireAdmin` redireciona para `/mesas` se `role !== 'admin'`.

### 6. Edge Function `admin-users`

Criar `supabase/functions/admin-users/index.ts` (Deno) que:
- Valida o JWT do chamador (`supabase.auth.getUser(authHeader)`)
- Confere que esse user é `admin` da mesma `company_id`
- Usa `SUPABASE_SERVICE_ROLE_KEY` para `auth.admin.createUser`, `updateUserById`, `deleteUser`, `generateLink({type:'recovery'})`
- Insere/atualiza `profiles` e `user_roles` conforme a ação
- Aceita `{ action: 'create'|'update'|'reset'|'delete', payload: {...} }`

Cliente: `src/lib/admin-users.ts` chama via `supabase.functions.invoke('admin-users', { body: ... })`. `src/pages/Usuarios.tsx` consome essa lib (substitui `useServerFn(adminUsers.xxx)`).

`supabase/config.toml`: declarar `[functions.admin-users]` com `verify_jwt = true`.

### 7. Remoção de `/api/public/seed-demo`

Deletar `src/routes/api/public/seed-demo.ts` e qualquer botão/menção a ela. Cartão de credenciais demo do login já está restrito a `import.meta.env.DEV`; manter, sem chamadas a seed.

### 8. Impressão

`PrintPreviewDialog` e `src/lib/print-order.ts` já são 100% client-side (`window.print()` + CSS `@media print`). Só removo as referências de `@tanstack/react-router` se houver e mantenho intactos os layouts 58mm/80mm.

### 9. SPA fallback no cPanel

Criar `public/.htaccess` para Apache (cPanel) reescrever todas as rotas para `index.html`:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

Vite copia `public/.htaccess` automaticamente para `dist/`.

### 10. Variáveis de ambiente

`.env.example`:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
```

Manter `src/integrations/supabase/client.ts` como está (já usa `VITE_*`).

### 11. Deploy no cPanel

Após `npm run build`:
1. Comprimir conteúdo de `dist/` em `.zip`.
2. Upload para `public_html/` no cPanel.
3. Extrair lá. O `.htaccess` já garante o roteamento SPA.

## Pontos de atenção / trade-offs

- A tela `/usuarios` passa a depender de uma Edge Function online. Sem internet/Supabase, ela não funciona — mesmo comportamento que antes.
- `SUPABASE_SERVICE_ROLE_KEY` permanece exclusivamente no ambiente da Edge Function (nunca no bundle estático).
- Como é SPA puro, não há mais pré-render/SEO; aceitável para um sistema interno de PDV.
- Após a migração, a "Publish" do Lovable também passa a servir o mesmo bundle estático.

Posso prosseguir com a implementação?
