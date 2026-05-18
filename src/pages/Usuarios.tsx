import { Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { adminCreateUser, adminUpdateUser } from '@/lib/admin-users';
import { Plus, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

interface UserRow { id: string; name: string; email: string; status: string; role: string | null; }

function UsuariosPage() {
  const { profile } = useAuth();
  if (profile && profile.role !== 'admin') return <Navigate to="/mesas" />;

  const [users, setUsers] = useState<UserRow[]>([]);
  const [editing, setEditing] = useState<Partial<UserRow> & { password?: string } | null>(null);

  const load = async () => {
    if (!profile) return;
    const { data: profs, error: pErr } = await supabase
      .from('profiles')
      .select('id, name, email, status')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: true });
    if (pErr) { toast.error(pErr.message); return; }
    const ids = (profs ?? []).map((p) => p.id);
    let rolesMap: Record<string, string> = {};
    if (ids.length) {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', ids);
      rolesMap = Object.fromEntries((roles ?? []).map((r: any) => [r.user_id, r.role]));
    }
    setUsers((profs ?? []).map((u) => ({
      id: u.id, name: u.name, email: u.email, status: u.status,
      role: rolesMap[u.id] ?? null,
    })));
  };
  useEffect(() => { load(); }, [profile?.company_id]);

  const save = async () => {
    if (!editing) return;
    try {
      if (editing.id) {
        await adminUpdateUser({
          user_id: editing.id,
          name: editing.name ?? '',
          role: (editing.role as 'admin' | 'staff') ?? 'staff',
          status: (editing.status as 'ativo' | 'inativo') ?? 'ativo',
          password: editing.password || undefined,
        });
      } else {
        await adminCreateUser({
          name: editing.name ?? '',
          email: editing.email ?? '',
          password: editing.password ?? '',
          role: (editing.role as 'admin' | 'staff') ?? 'staff',
        });
      }
      toast.success('Salvo'); setEditing(null); load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao salvar');
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Equipe</p>
          <h1 className="font-display text-3xl sm:text-4xl mt-1">Usuários</h1>
        </div>
        <Button onClick={() => setEditing({ role: 'staff', status: 'ativo' })}>
          <Plus className="h-4 w-4 mr-1"/>Novo usuário
        </Button>
      </header>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-secondary/40">
            <tr>
              <th className="text-left px-4 py-3">Nome</th>
              <th className="text-left px-4 py-3 hidden sm:table-cell">E-mail</th>
              <th className="text-left px-4 py-3">Perfil</th>
              <th className="text-left px-4 py-3">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{u.email}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{u.role ?? '—'}</span></td>
                <td className="px-4 py-3 text-xs">{u.status}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(u)}><Edit2 className="h-4 w-4"/></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing.id ? 'Editar usuário' : 'Novo usuário'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })}/></div>
              {!editing.id && (
                <div><Label>E-mail</Label><Input type="email" value={editing.email ?? ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })}/></div>
              )}
              <div>
                <Label>{editing.id ? 'Nova senha (deixe vazio para manter)' : 'Senha'}</Label>
                <Input type="password" value={editing.password ?? ''} onChange={(e) => setEditing({ ...editing, password: e.target.value })}/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Perfil</Label>
                  <select value={editing.role ?? 'staff'} onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="staff">Atendente</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                {editing.id && (
                  <div>
                    <Label>Status</Label>
                    <select value={editing.status ?? 'ativo'} onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="ativo">Ativo</option>
                      <option value="inativo">Inativo</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={save}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default UsuariosPage;
