import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/_app/usuarios')({
  component: UsuariosPage,
});

function UsuariosPage() {
  const { profile } = useAuth();
  if (profile && profile.role !== 'admin') return <Navigate to="/mesas" />;

  const [users, setUsers] = useState<any[]>([]);
  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data } = await supabase.from('profiles')
        .select('id, name, email, status, user_roles(role)')
        .eq('company_id', profile.company_id);
      setUsers(data ?? []);
    })();
  }, [profile?.company_id]);

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Equipe</p>
        <h1 className="font-display text-3xl sm:text-4xl mt-1">Usuários</h1>
      </header>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-secondary/40">
            <tr><th className="text-left px-4 py-3">Nome</th><th className="text-left px-4 py-3">E-mail</th><th className="text-left px-4 py-3">Perfil</th><th className="text-left px-4 py-3">Status</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{u.user_roles?.[0]?.role ?? '—'}</span></td>
                <td className="px-4 py-3 text-xs">{u.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        A criação completa de usuários (com convite/senha) será habilitada na próxima fase, junto com o módulo de Caixa.
      </p>
    </div>
  );
}
