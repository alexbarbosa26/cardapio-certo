import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import Landing from '@/pages/Landing';

function IndexRedirect() {
  const { loading, user, profile, isSuperAdmin, isCompanyAccessAllowed } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }
  if (!user) return <Landing />;
  if (isSuperAdmin) return <Navigate to="/global/dashboard" replace />;
  if (!isCompanyAccessAllowed) return <Navigate to="/assinatura-suspensa" replace />;
  if (profile?.role === 'admin') return <Navigate to="/dashboard" replace />;
  return <Navigate to="/mesas" replace />;
}

export default IndexRedirect;
