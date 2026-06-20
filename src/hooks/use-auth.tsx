import { useEffect, useState, createContext, useContext, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session, User } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'staff' | 'super_admin';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled' | 'expired' | 'pending_payment' | 'failed';

export interface AuthProfile {
  id: string;
  /** Empty string for super admins (no company). */
  company_id: string;
  name: string;
  email: string;
  status: string;
  company_name?: string;
  role: AppRole | null;
}

export interface ActiveSubscription {
  id: string;
  status: SubscriptionStatus;
  plan_id: string;
  plan_name?: string;
  current_period_end: string | null;
  trial_ends_at: string | null;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: AuthProfile | null;
  subscription: ActiveSubscription | null;
  isSuperAdmin: boolean;
  isCompanyAccessAllowed: boolean;
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
    company_id: p.company_id ?? '',
    name: p.name,
    email: p.email,
    status: p.status,
    company_name: (p as { companies?: { name?: string } }).companies?.name,
    role: (r?.role as AppRole) ?? null,
  };
}

async function loadSubscription(companyId: string): Promise<ActiveSubscription | null> {
  const { data } = await supabase
    .from('subscriptions')
    .select('id, status, plan_id, current_period_end, trial_ends_at, plans(name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    status: data.status as SubscriptionStatus,
    plan_id: data.plan_id,
    plan_name: (data as { plans?: { name?: string } }).plans?.name,
    current_period_end: data.current_period_end,
    trial_ends_at: data.trial_ends_at,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [subscription, setSubscription] = useState<ActiveSubscription | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const hydrate = async (sess: Session | null) => {
    if (!sess?.user) {
      setProfile(null);
      setSubscription(null);
      return;
    }
    const p = await loadProfile(sess.user.id);
    if (p && p.status === 'inativo') {
      await supabase.auth.signOut();
      setProfile(null);
      setSubscription(null);
      return;
    }
    let sub: ActiveSubscription | null = null;
    if (p?.company_id) {
      sub = await loadSubscription(p.company_id);
    }
    setProfile(p);
    setSubscription(sub);
  };

  const refresh = async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    setUser(data.session?.user ?? null);
    await hydrate(data.session);
    setInitialLoading(false);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((evt, sess) => {
      // Keep session/user fresh — synchronous, never blocks UI.
      setSession(sess);
      setUser(sess?.user ?? null);

      // Only re-hydrate profile/subscription on meaningful identity changes.
      // TOKEN_REFRESHED and INITIAL_SESSION must NOT trigger UI-blocking work,
      // otherwise tab focus revalidations cause the whole app to unmount.
      if (evt === 'SIGNED_OUT') {
        setProfile(null);
        setSubscription(null);
        return;
      }
      if (evt === 'SIGNED_IN' || evt === 'USER_UPDATED') {
        setTimeout(() => { void hydrate(sess); }, 0);
      }
      // TOKEN_REFRESHED / INITIAL_SESSION: ignore — handled by refresh() on mount.
    });
    refresh();
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn: AuthCtx['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: 'E-mail ou senha incorretos.' };
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const p = await loadProfile(data.user.id);
      if (p && p.status === 'inativo') {
        await supabase.auth.signOut();
        return { error: 'Usuário inativo. Procure o administrador.' };
      }
    }
    await refresh();
    return {};
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSubscription(null);
  };

  const isSuperAdmin = profile?.role === 'super_admin';
  const isCompanyAccessAllowed =
    isSuperAdmin ||
    (!!profile?.company_id &&
      !!subscription &&
      (subscription.status === 'active' ||
        subscription.status === 'trialing' ||
        subscription.status === 'past_due'));

  return (
    <Ctx.Provider value={{
      user, session, profile, subscription,
      isSuperAdmin, isCompanyAccessAllowed,
      loading: initialLoading, signIn, signOut, refresh,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fora do AuthProvider');
  return v;
}
