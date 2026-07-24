# Gestão Global de Usuários (Super Admin)

Implementação incremental sobre a estrutura existente (`admin-users` Edge Function, tabelas `profiles`/`user_roles`/`companies`, layout `/global/*`). Nenhuma refatoração de auth, permissões ou tenants — apenas extensão para o superadmin.

## Escopo

### 1. Backend — Edge Function `admin-users` (extensão)
Adicionar novas actions restritas a `super_admin`:
- `list_all` — lista usuários de todas as empresas (join com `profiles`, `user_roles`, `companies`, `auth.users` p/ `created_at`/`last_sign_in_at`). Filtros: busca por nome/email, empresa, role, status.
- `create_global` — cria usuário e vincula à empresa escolhida. Role permitida: `admin`, `staff` ou `super_admin` (este último exige confirmação no frontend).
- `update_global` — edita nome, empresa (`company_id`), role, status. Bloqueia auto-remoção do último `super_admin` ativo.
- `reset_password_global` — define nova senha (via `auth.admin.updateUserById`).

Regras de segurança (todas verificadas no servidor):
- Todas as actions novas exigem `role === 'super_admin'` do caller.
- Actions antigas (`create`, `update`) continuam funcionando para admins de empresa (fluxo `/usuarios` intacto), mas ganham guarda: **não podem tocar em usuários com role `super_admin`** nem promover ninguém a `super_admin`.
- Antes de rebaixar/inativar um super_admin, contar quantos existem — impedir se for o último.
- Auditoria: gravar em `audit_logs` (já existe) evento por ação: `user.created`, `user.updated`, `user.role_changed`, `user.company_changed`, `user.password_reset`, `user.status_changed`. Nunca logar senha.

### 2. Frontend — nova página `/global/usuarios`
- Novo item de menu em `GlobalAdminLayout` (ícone Users).
- `GlobalUsuarios.tsx`: tabela com nome, email, empresa, role (badge colorido), status, criado em, último acesso. Filtros de busca/empresa/role. Ações: Editar, Resetar senha.
- Diálogo "Novo usuário": nome, email, senha + confirmação, empresa (select carregando `companies`), role (admin/staff/super_admin com aviso). Super_admin pode ser criado sem empresa.
- Diálogo "Editar": nome, empresa, role, status.
- Diálogo "Resetar senha": nova senha + confirmação.

### 3. Componente compartilhado `PasswordStrengthField`
- Input com toggle de visibilidade.
- Medidor visual (fraca/média/forte) baseado em: ≥8 chars, maiúscula, minúscula, número, símbolo, HIBP-safe (Supabase valida no servidor).
- Lista de requisitos com check verde/cinza em tempo real.
- Erros do servidor traduzidos: senha vazada (HIBP), muito curta, muito comum, etc.
- Reutilizado em: criação global, reset global, e opcionalmente no fluxo `/usuarios` atual.

### 4. Rota e guard
- `App.tsx`: rota `/global/usuarios` dentro de `RequireSuperAdmin` + `GlobalAdminLayout`.
- Nada muda para `admin`/`staff` — eles não veem o menu, e o RequireSuperAdmin já bloqueia URL direta.

## Fora de escopo (por segurança e brevidade)
- Não alterar `RequireCompanyAccess`, `AuthProvider`, tipo `AppRole` (já inclui `super_admin`).
- Não migrar dados nem alterar tabelas — reaproveitar `audit_logs`, `profiles`, `user_roles`.
- Não expor `SERVICE_ROLE_KEY` no frontend (mantido só na Edge Function).
- Envio de link de recovery por email fica para depois (usa apenas reset manual).

## Detalhes técnicos

**Fetch de `last_sign_in_at`**: usar `admin.auth.admin.listUsers({ page, perPage })` na Edge Function e cruzar com `profiles` por id (o super_admin já tem permissão de listar). Paginação server-side (50/pág).

**Proteção do último super_admin**:
```sql
select count(*) from user_roles where role='super_admin'
  and user_id in (select id from profiles where status='ativo')
```
Se count=1 e o alvo é esse mesmo user, bloquear rebaixar/inativar.

**Bloqueio de escalação por admin de empresa** (action `update` já existente):
```ts
const { data: targetRole } = await admin.from('user_roles')
  .select('role').eq('user_id', user_id).maybeSingle();
if (targetRole?.role === 'super_admin') return json({ error: 'Não autorizado' }, 403);
if (newRole === 'super_admin' && callerRole !== 'super_admin')
  return json({ error: 'Não autorizado' }, 403);
```

**Arquivos afetados**:
- `supabase/functions/admin-users/index.ts` (adicionar actions, refatorar guarda de role)
- `src/lib/admin-users.ts` (novas funções `adminListAllUsers`, `adminCreateGlobalUser`, `adminUpdateGlobalUser`, `adminResetPasswordGlobal`)
- `src/pages/global/GlobalUsuarios.tsx` (novo)
- `src/pages/global/GlobalAdminLayout.tsx` (item de menu)
- `src/components/password-strength-field.tsx` (novo)
- `src/App.tsx` (rota)
