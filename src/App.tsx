import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/hooks/use-auth';
import { TenantBrandingProvider } from '@/hooks/use-tenant-branding';
import { PermissionsProvider } from '@/hooks/use-permissions';
import MinhaAssinatura from '@/pages/MinhaAssinatura';
import { PrintPreviewDialog } from '@/components/print-preview-dialog';
import { RequireAuth, RequireSuperAdmin, RequireCompanyAccess } from '@/components/route-guards';
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
import AssinaturaSuspensa from '@/pages/AssinaturaSuspensa';
import Landing from '@/pages/Landing';
import Contratar from '@/pages/Contratar';
import Checkout from '@/pages/Checkout';
import GlobalAdminLayout from '@/pages/global/GlobalAdminLayout';
import GlobalDashboard from '@/pages/global/GlobalDashboard';
import GlobalEmpresas from '@/pages/global/GlobalEmpresas';
import GlobalPlanos from '@/pages/global/GlobalPlanos';
import GlobalAssinaturas from '@/pages/global/GlobalAssinaturas';
import GlobalAuditoria from '@/pages/global/GlobalAuditoria';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <TenantBrandingProvider>
          <PermissionsProvider>
          <BrowserRouter>
            <Routes>
              {/* Públicas */}
              <Route path="/" element={<Index />} />
              <Route path="/contratar/:planSlug" element={<Contratar />} />
              <Route path="/checkout/:sessionId" element={<Checkout />} />
              <Route path="/login" element={<Login />} />

              {/* Tela informativa de bloqueio – exige login mas não exige assinatura ativa */}
              <Route element={<RequireAuth />}>
                <Route path="/assinatura-suspensa" element={<AssinaturaSuspensa />} />
              </Route>

              {/* Painel global do dono do SaaS */}
              <Route element={<RequireSuperAdmin />}>
                <Route element={<GlobalAdminLayout />}>
                  <Route path="/global/dashboard" element={<GlobalDashboard />} />
                  <Route path="/global/empresas" element={<GlobalEmpresas />} />
                  <Route path="/global/planos" element={<GlobalPlanos />} />
                  <Route path="/global/assinaturas" element={<GlobalAssinaturas />} />
                  <Route path="/global/auditoria" element={<GlobalAuditoria />} />
                </Route>
              </Route>

              {/* App operacional da empresa */}
              <Route element={<RequireCompanyAccess />}>
                <Route element={<AppLayout />}>
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
                  <Route path="/assinatura" element={<MinhaAssinatura />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
            <PrintPreviewDialog />
            <Toaster richColors position="top-right" />
          </BrowserRouter>
          </PermissionsProvider>
          </TenantBrandingProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
