import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, KeyRound, Search, Shield, ShieldCheck, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  adminListAllUsers, adminCreateGlobalUser, adminUpdateGlobalUser,
  adminResetPasswordGlobal, type GlobalRole, type GlobalUserRow,
} from '@/lib/admin-users';
import { PasswordStrengthField, isPasswordValid } from '@/components/password-strength-field';
import { useAuth } from '@/hooks/use-auth';

interface Company { id: string; name: string }

const ROLE_LABEL: Record<GlobalRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  staff: 'Atendente',
};

function roleBadge(role: GlobalRole | null) {
  if (role === 'super_admin')
    return <Badge className="bg-accent text-accent-foreground gap-1"><ShieldCheck className="h-3 w-3" />Super Admin</Badge>;
  if (role === 'admin')
    return <Badge variant="secondary" className="gap-1"><Shield className="h-3 w-3" />Admin</Badge>;
  return <Badge variant="outline" className="gap-1"><UserIcon className="h-3 w-3" />Atendente</Badge>;
}

function fmtDate(v: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

interface EditState {
  id?: string;
  name: string;
  email: string;
  company_id: string | null;
  role: GlobalRole;
  status: 'ativo' | 'inativo';
  password: string;
  confirm: string;
}

const EMPTY: EditState = {
  name: '', email: '', company_id: null, role: 'staff', status: 'ativo', password: '', confirm: '',
};

export default function GlobalUsuarios() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<GlobalUserRow[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [fRole, setFRole] = useState<'all' | GlobalRole>('all');
  const [fCompany, setFCompany] = useState<'all' | string>('all');
  const [fStatus, setFStatus] = useState<'all' | 'ativo' | 'inativo'>('all');

  const [editing, setEditing] = useState<EditState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [resetting, setResetting] = useState<GlobalUserRow | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [savingReset, setSavingReset] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { users } = await adminListAllUsers({});
      setRows(users);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    supabase.from('companies').select('id, name').order('name').then(({ data }) => {
      setCompanies((data as Company[]) ?? []);
    });
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (fRole !== 'all' && r.role !== fRole) return false;
      if (fCompany !== 'all' && (r.company_id ?? '') !== fCompany) return false;
      if (fStatus !== 'all' && r.status !== fStatus) return false;
      if (s && !`${r.name} ${r.email}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [rows, search, fRole, fCompany, fStatus]);

  const counts = useMemo(() => ({
    total: rows.length,
    super: rows.filter((r) => r.role === 'super_admin' && r.status === 'ativo').length,
    admin: rows.filter((r) => r.role === 'admin').length,
    inactive: rows.filter((r) => r.status === 'inativo').length,
  }), [rows]);

  const openCreate = () => setEditing({ ...EMPTY });
  const openEdit = (r: GlobalUserRow) => setEditing({
    id: r.id, name: r.name, email: r.email, company_id: r.company_id,
    role: (r.role ?? 'staff') as GlobalRole,
    status: r.status === 'inativo' ? 'inativo' : 'ativo',
    password: '', confirm: '',
  });

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.email.trim())
      return toast.error('Nome e e-mail são obrigatórios.');
    if (editing.role !== 'super_admin' && !editing.company_id)
      return toast.error('Selecione uma empresa para admin/atendente.');
    if (!editing.id) {
      if (!isPasswordValid(editing.password))
        return toast.error('Senha não atende aos requisitos mínimos.');
      if (editing.password !== editing.confirm)
        return toast.error('As senhas não conferem.');
    }
    setSavingEdit(true);
    try {
      if (editing.id) {
        await adminUpdateGlobalUser({
          user_id: editing.id, name: editing.name.trim(),
          company_id: editing.role === 'super_admin' ? null : editing.company_id,
          role: editing.role, status: editing.status,
        });
      } else {
        await adminCreateGlobalUser({
          name: editing.name.trim(), email: editing.email.trim(),
          password: editing.password,
          company_id: editing.role === 'super_admin' ? null : editing.company_id,
          role: editing.role,
        });
      }
      toast.success('Usuário salvo.');
      setEditing(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingEdit(false);
    }
  };

  const doReset = async () => {
    if (!resetting) return;
    if (!isPasswordValid(resetPw))
      return toast.error('Senha não atende aos requisitos mínimos.');
    if (resetPw !== resetConfirm)
      return toast.error('As senhas não conferem.');
    setSavingReset(true);
    try {
      await adminResetPasswordGlobal(resetting.id, resetPw);
      toast.success('Senha redefinida.');
      setResetting(null); setResetPw(''); setResetConfirm('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingReset(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuários do Sistema</h1>
          <p className="text-sm text-muted-foreground">Gerencie todos os usuários de todas as empresas.</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Novo usuário</Button>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total</div><div className="text-2xl font-semibold">{counts.total}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Super admins ativos</div><div className="text-2xl font-semibold">{counts.super}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Admins</div><div className="text-2xl font-semibold">{counts.admin}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Inativos</div><div className="text-2xl font-semibold">{counts.inactive}</div></Card>
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome ou e-mail" className="pl-9"
                   value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={fRole} onValueChange={(v) => setFRole(v as 'all' | GlobalRole)}>
            <SelectTrigger><SelectValue placeholder="Perfil" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os perfis</SelectItem>
              <SelectItem value="super_admin">Super Admin</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="staff">Atendente</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fStatus} onValueChange={(v) => setFStatus(v as 'all' | 'ativo' | 'inativo')}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="inativo">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Select value={fCompany} onValueChange={setFCompany}>
          <SelectTrigger className="sm:max-w-xs"><SelectValue placeholder="Empresa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as empresas</SelectItem>
            {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Usuário</th>
                <th className="px-3 py-2 font-medium">Perfil</th>
                <th className="px-3 py-2 font-medium">Empresa</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Último acesso</th>
                <th className="px-3 py-2 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Carregando…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Nenhum usuário encontrado.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                  </td>
                  <td className="px-3 py-2">{roleBadge(r.role)}</td>
                  <td className="px-3 py-2">{r.company_name ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2">
                    {r.status === 'ativo'
                      ? <Badge variant="secondary">Ativo</Badge>
                      : <Badge variant="outline" className="text-destructive border-destructive/40">Inativo</Badge>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.last_sign_in_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                        <Pencil className="h-4 w-4 mr-1" />Editar
                      </Button>
                      <Button size="sm" variant="ghost"
                        disabled={r.id === profile?.id}
                        onClick={() => { setResetting(r); setResetPw(''); setResetConfirm(''); }}>
                        <KeyRound className="h-4 w-4 mr-1" />Senha
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Dialog criar/editar */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar usuário' : 'Novo usuário'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail</Label>
                  <Input type="email" value={editing.email}
                    disabled={!!editing.id}
                    onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Perfil</Label>
                  <Select value={editing.role} onValueChange={(v) => setEditing({ ...editing, role: v as GlobalRole })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="staff">Atendente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={editing.status}
                    onValueChange={(v) => setEditing({ ...editing, status: v as 'ativo' | 'inativo' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {editing.role !== 'super_admin' && (
                <div className="space-y-1.5">
                  <Label>Empresa</Label>
                  <Select value={editing.company_id ?? ''}
                    onValueChange={(v) => setEditing({ ...editing, company_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!editing.id && (
                <PasswordStrengthField
                  value={editing.password}
                  onChange={(v) => setEditing({ ...editing, password: v })}
                  confirmValue={editing.confirm}
                  onConfirmChange={(v) => setEditing({ ...editing, confirm: v })}
                />
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save} disabled={savingEdit}>{savingEdit ? 'Salvando…' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog reset senha */}
      <Dialog open={!!resetting} onOpenChange={(v) => !v && setResetting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
          </DialogHeader>
          {resetting && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Definir nova senha para <strong>{resetting.name}</strong> ({resetting.email}).
              </p>
              <PasswordStrengthField
                value={resetPw} onChange={setResetPw}
                confirmValue={resetConfirm} onConfirmChange={setResetConfirm}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetting(null)}>Cancelar</Button>
            <Button onClick={doReset} disabled={savingReset}>
              {savingReset ? 'Salvando…' : 'Redefinir senha'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
