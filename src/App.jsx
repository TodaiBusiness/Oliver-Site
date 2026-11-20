import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './app/AuthContext.jsx';
import ProtectedRoute from './app/ProtectedRoute.jsx';
import MessageNotifier from './components/MessageNotifier.jsx';
import RouteSeo from './app/RouteSeo.jsx';
import PageTracker from './app/PageTracker.jsx';

import SiteLayout from './components/SiteLayout.jsx';
import Home from './pages/Home.jsx';
import Sistema from './pages/Sistema.jsx';
import Pdv from './pages/Pdv.jsx';
import Assinar from './pages/Assinar.jsx';
import Precos from './pages/Precos.jsx';
import Servicos from './pages/Servicos.jsx';
import ServicoLandingPages from './pages/ServicoLandingPages.jsx';
import ServicoSites from './pages/ServicoSites.jsx';
import ServicoSaas from './pages/ServicoSaas.jsx';
import ProjetosPage from './pages/ProjetosPage.jsx';
import ComoFunciona from './pages/ComoFunciona.jsx';
import Contato from './pages/Contato.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import SecuritySettings from './pages/SecuritySettings.jsx';
import ClientLayout from './pages/client/ClientLayout.jsx';
import ClientDashboard from './pages/client/Dashboard.jsx';
import ClientRequests from './pages/client/Requests.jsx';
import ClientRequestDetail from './pages/client/RequestDetail.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import AdminDashboard from './pages/admin/Dashboard.jsx';
import AdminProjects from './pages/admin/Projects.jsx';
import AdminClients from './pages/admin/Clients.jsx';
import AdminClientDetail from './pages/admin/ClientDetail.jsx';
import AdminRequests from './pages/admin/Requests.jsx';
import AdminAudit from './pages/admin/Audit.jsx';
import Messages from './pages/Messages.jsx';
import ClientAreaInfo from './pages/ClientAreaInfo.jsx';
import Buy from './pages/Buy.jsx';
import ThankYou from './pages/ThankYou.jsx';
import Download from './pages/Download.jsx';
import Terms from './pages/Terms.jsx';
import Privacy from './pages/Privacy.jsx';
import MyLicense from './pages/MyLicense.jsx';
import NotFound from './pages/NotFound.jsx';
const PortalApp = lazy(() => import('./pages/portal/PortalApp.jsx'));

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        {/* Fora das rotas: o aviso aparece em qualquer página. */}
        <MessageNotifier />
        <RouteSeo />
        <PageTracker />

        <Routes>
          {/* ---- Site público ---- */}
          <Route element={<SiteLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/sistema" element={<Sistema />} />
            <Route path="/sistema/pdv" element={<Pdv />} />
            <Route path="/assinar" element={<Assinar />} />
            <Route path="/precos" element={<Precos />} />
            <Route path="/servicos" element={<Servicos />} />
            <Route path="/servicos/landing-pages" element={<ServicoLandingPages />} />
            <Route path="/servicos/sites" element={<ServicoSites />} />
            <Route path="/servicos/saas" element={<ServicoSaas />} />
            <Route path="/projetos" element={<ProjetosPage />} />
            <Route path="/como-funciona" element={<ComoFunciona />} />
            <Route path="/contato" element={<Contato />} />
            <Route path="/comprar" element={<Buy />} />
            <Route path="/obrigado" element={<ThankYou />} />
            <Route path="/baixar" element={<Download />} />
            <Route path="/termos" element={<Terms />} />
            <Route path="/privacidade" element={<Privacy />} />
            <Route path="/minha-licenca" element={<MyLicense />} />
            <Route path="/area-do-cliente" element={<ClientAreaInfo />} />
          </Route>
          <Route path="/login" element={<Login />} />
          <Route path="/cadastro" element={<Register />} />
          <Route path="/esqueci-senha" element={<ForgotPassword />} />
          <Route path="/redefinir-senha" element={<ResetPassword />} />

          {/* ---- Portal de pedidos da loja: layout próprio, fora do SiteLayout, carregado só quando alguém abre /l/... ---- */}
          <Route
            path="/l/:slug/*"
            element={
              <Suspense fallback={<p role="status">Carregando…</p>}>
                <PortalApp />
              </Suspense>
            }
          />

          {/* ---- Área do cliente ---- */}
          <Route
            path="/cliente"
            element={
              <ProtectedRoute>
                <ClientLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<ClientDashboard />} />
            <Route path="solicitacoes" element={<ClientRequests />} />
            <Route path="mensagens" element={<Messages basePath="/cliente/mensagens" />} />
            <Route path="mensagens/:id" element={<Messages basePath="/cliente/mensagens" />} />
            <Route path="solicitacoes/:id" element={<ClientRequestDetail />} />
            <Route path="seguranca" element={<SecuritySettings />} />
          </Route>

          {/* ---- Painel administrativo ---- */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="projetos" element={<AdminProjects />} />
            <Route path="clientes" element={<AdminClients />} />
            <Route path="clientes/:id" element={<AdminClientDetail />} />
            <Route path="solicitacoes" element={<AdminRequests />} />
            <Route path="auditoria" element={<AdminAudit />} />
            <Route path="seguranca" element={<SecuritySettings />} />
            <Route path="mensagens" element={<Messages basePath="/admin/mensagens" />} />
            <Route path="mensagens/:id" element={<Messages basePath="/admin/mensagens" />} />
            <Route
              path="solicitacoes/:id"
              element={<ClientRequestDetail basePath="/admin/solicitacoes" />}
            />
          </Route>

          {/* ---- Rotas antigas / desconhecidas ---- */}
          <Route path="/dashboard" element={<Navigate to="/cliente" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
