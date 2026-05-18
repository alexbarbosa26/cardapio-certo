import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { PrintPreviewDialog } from '@/components/print-preview-dialog';
import AppLayout from '@/pages/AppLayout';
import Login from '@/pages/Login';
import Index from '@/pages/Index';
import NotFound from '@/pages/NotFound';
import Mesas from '@/pages/Mesas';
import Comandas from '@/pages/Comandas';
import Cozinha from '@/pages/Cozinha';
import Caixa from '@/pages/Caixa';
import Dashboard from '@/pages/Dashboard';
import Produtos from '@/pages/Produtos';
import GruposOpcoes from '@/pages/GruposOpcoes';
import Configuracoes from '@/pages/Configuracoes';
import Relatorios from '@/pages/Relatorios';
import Usuarios from '@/pages/Usuarios';

const queryClient = new QueryClient();

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
                <Route path="/" element={<Index />} />
                <Route path="/mesas" element={<Mesas />} />
                <Route path="/comandas" element={<Comandas />} />
                <Route path="/cozinha" element={<Cozinha />} />
                <Route path="/caixa" element={<Caixa />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/produtos" element={<Produtos />} />
                <Route path="/grupos-opcoes" element={<GruposOpcoes />} />
                <Route path="/configuracoes" element={<Configuracoes />} />
                <Route path="/relatorios" element={<Relatorios />} />
                <Route path="/usuarios" element={<Usuarios />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
            <PrintPreviewDialog />
            <Toaster richColors position="top-right" />
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
