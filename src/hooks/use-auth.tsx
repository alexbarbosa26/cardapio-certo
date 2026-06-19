import { useEffect, useRef, useState, createContext, useContext, type ReactNode } from 'react';
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
  /** True only during the very first auth check, before we know if a session exists. */
  loading: boolean;
  /** True during background revalidations; UI should NOT unmount on this. */
  refreshingAuth: boolean;
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
  const [refreshingAuth, setRefreshingAuth] = useState(false);

  // Track the user id we last hydrated for, so we can skip redundant fetches
  // on TOKEN_REFRESHED / repeated SIGNED_IN events.
  const hydratedForUserId = useRef<string | null>(null);
  const hydratingRef = useRef(false);

  const hydrate = async (sess: Session | null, opts: { force?: boolean; background?: boolean } = {}) => {
    const uid = sess?.user?.id ?? null;
    if (!uid) {
      hydratedForUserId.current = null;
      setProfile(null);
      setSubscription(null);
      return;
    }
    // Skip if already hydrated for this user and not forced.
    if (!opts.force && hydratedForUserId.current === uid) return;
    if (hydratingRef.current) return;
    hydratingRef.current = true;
    if (opts.background) setRefreshingAuth(true);
    try {
      const p = await loadProfile(uid);
      if (p && p.status === 'inativo') {
        await supabase.auth.signOut();
        hydratedForUserId.current = null;
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
      hydratedForUserId.current = uid;
    } finally {
      hydratingRef.current = false;
      if (opts.background) setRefreshingAuth(false);
    }
  };

  const refresh = async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    setUser(data.session?.user ?? null);
    await hydrate(data.session, { force: true });
  };

  useEffect(() => {
    let mounted = true;

    const { data: sub } = supabase.auth.onAuthStateChange((evt, sess) => {
      if (!mounted) return;
      // Always keep session/user in sync — these are cheap and don't unmount UI.
      setSession(sess);
      setUser(sess?.user ?? null);

      switch (evt) {
        case 'SIGNED_OUT': {
          hydratedForUserId.current = null;
          setProfile(null);
          setSubscription(null);
          return;
        }
        case 'TOKEN_REFRESHED': {
          // Just refresh tokens; do NOT touch profile/subscription or trigger loading.
          return;
        }
        case 'USER_UPDATED': {
          // Re-hydrate in background, keep current UI mounted.
          if (sess?.user) {
            setTimeout(() => { void hydrate(sess, { force: true, background: true }); }, 0);
          }
          return;
        }
        case 'SIGNED_IN':
        case 'INITIAL_SESSION':
        default: {
          if (sess?.user && hydratedForUserId.current !== sess.user.id) {
            // First-time hydration for this user — no background flag so initial flow completes.
            setTimeout(() => { void hydrate(sess); }, 0);
          }
          return;
        }
      }
    });

    // Initial session check.
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(data.session);
        setUser(data.session?.user ?? null);
        await hydrate(data.session);
      } finally {
        if (mounted) setInitialLoading(false);
      }
    })();

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
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
    hydratedForUserId.current = null;
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
      loading: initialLoading,
      refreshingAuth,
      signIn, signOut, refresh,
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
