import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';

export function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function RequireSuperAdmin() {
  const { loading, user, isSuperAdmin } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Bloqueia rotas operacionais da empresa se assinatura não permite acesso. */
export function RequireCompanyAccess() {
  const { loading, user, profile, isSuperAdmin, isCompanyAccessAllowed } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (isSuperAdmin) return <Navigate to="/global/dashboard" replace />;
  if (!profile) return null;
  if (!isCompanyAccessAllowed) return <Navigate to="/assinatura-suspensa" replace />;
  return <Outlet />;
}

export function RequireAdmin() {
  const { loading, profile } = useAuth();
  if (loading) return null;
  if (profile?.role !== 'admin') return <Navigate to="/mesas" replace />;
  return <Outlet />;
}
