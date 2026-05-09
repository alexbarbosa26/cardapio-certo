import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useAuth } from '@/hooks/use-auth';

export const Route = createFileRoute('/')({
  component: IndexRedirect,
});

function IndexRedirect() {
  const { loading, user, profile } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;
  if (profile?.role === 'admin') return <Navigate to="/dashboard" />;
  return <Navigate to="/mesas" />;
}
