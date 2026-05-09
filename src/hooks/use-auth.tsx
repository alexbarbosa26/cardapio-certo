import { useEffect, useState, createContext, useContext, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session, User } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'staff';

export interface AuthProfile {
  id: string;
  company_id: string;
  name: string;
  email: string;
  status: string;
  company_name?: string;
  role: AppRole | null;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: AuthProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

async function loadProfile(userId: string): Promise<AuthProfile | null> {
  const { data: p } = await supabase
    .from('profiles')
    .select('id, company_id, name, email, status, companies(name)')
    .eq('id', userId)
    .maybeSingle();
  if (!p) return null;
  const { data: r } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  return {
    id: p.id,
    company_id: p.company_id,
    name: p.name,
    email: p.email,
    status: p.status,
    company_name: (p as any).companies?.name,
    role: (r?.role as AppRole) ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    setUser(data.session?.user ?? null);
    if (data.session?.user) {
      const p = await loadProfile(data.session.user.id);
      setProfile(p);
    } else {
      setProfile(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        // não bloquear callback
        setTimeout(() => loadProfile(sess.user.id).then(setProfile), 0);
      } else {
        setProfile(null);
      }
    });
    refresh();
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn: AuthCtx['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: 'E-mail ou senha incorretos.' };
    await refresh();
    return {};
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <Ctx.Provider value={{ user, session, profile, loading, signIn, signOut, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fora do AuthProvider');
  return v;
}
