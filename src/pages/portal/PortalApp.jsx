import { Route, Routes } from 'react-router-dom';
import '../../styles/portal.css';
import PortalLayout from './PortalLayout.jsx';
import PortalHome from './PortalHome.jsx';
import { PortalLogin, PortalRegister, PortalForgot, PortalReset, RequireLogin } from './PortalAuth.jsx';
import PortalCatalog from './PortalCatalog.jsx';
import PortalCart from './PortalCart.jsx';
import { PortalOrders, PortalOrder } from './PortalOrders.jsx';
import { PortalFiado, PortalAccount, PortalNotFound } from './PortalMore.jsx';

/** Rotas do portal de uma loja (/l/:slug/...), em um pacote à parte do site. */
export default function PortalApp() {
  return (
    <Routes>
      <Route element={<PortalLayout />}>
        <Route index element={<PortalHome />} />
        <Route path="entrar" element={<PortalLogin />} />
        <Route path="cadastro" element={<PortalRegister />} />
        <Route path="esqueci-senha" element={<PortalForgot />} />
        <Route path="redefinir-senha" element={<PortalReset />} />
        <Route path="catalogo" element={<RequireLogin><PortalCatalog /></RequireLogin>} />
        <Route path="carrinho" element={<RequireLogin><PortalCart /></RequireLogin>} />
        <Route path="pedidos" element={<RequireLogin><PortalOrders /></RequireLogin>} />
        <Route path="pedidos/:id" element={<RequireLogin><PortalOrder /></RequireLogin>} />
        <Route path="fiado" element={<RequireLogin><PortalFiado /></RequireLogin>} />
        <Route path="conta" element={<RequireLogin><PortalAccount /></RequireLogin>} />
        <Route path="*" element={<PortalNotFound />} />
      </Route>
    </Routes>
  );
}
