import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';

export function RequireAuth() {
  const { user, loading } = useAuth();
  // Only block on the initial auth check; background revalidations keep UI mounted.
  if (loading && !user) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function RequireSuperAdmin() {
  const { loading, user, isSuperAdmin } = useAuth();
  if (loading && !user) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Bloqueia rotas operacionais da empresa se assinatura não permite acesso. */
export function RequireCompanyAccess() {
  const { loading, user, profile, isSuperAdmin, isCompanyAccessAllowed } = useAuth();
  if (loading && !user) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (isSuperAdmin) return <Navigate to="/global/dashboard" replace />;
  // Wait for profile only on first load; once we have it, keep rendering through revalidations.
  if (!profile) {
    if (loading) return null;
    return null;
  }
  if (!isCompanyAccessAllowed) return <Navigate to="/assinatura-suspensa" replace />;
  return <Outlet />;
}

export function RequireAdmin() {
  const { loading, profile } = useAuth();
  if (loading && !profile) return null;
  if (profile?.role !== 'admin') return <Navigate to="/mesas" replace />;
  return <Outlet />;
}
