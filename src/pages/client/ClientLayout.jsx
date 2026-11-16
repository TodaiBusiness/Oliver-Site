import PanelShell from '../../components/panel/PanelShell.jsx';
import { useAuth } from '../../app/AuthContext.jsx';

/** Moldura da área do cliente: navegação lateral + conteúdo da rota. */
export default function ClientLayout() {
  const { isAdmin } = useAuth();

  const groups = [
    {
      links: [
        { to: '/cliente', label: 'Painel', icon: 'dashboard', end: true },
        { to: '/cliente/solicitacoes', label: 'Solicitações', icon: 'bolt' },
        { to: '/cliente/mensagens', label: 'Mensagens', icon: 'chat', badge: true },
      ],
    },
    {
      label: 'Conta',
      links: [
        { to: '/cliente/seguranca', label: 'Segurança', panelIcon: 'shield' },
        ...(isAdmin ? [{ to: '/admin', label: 'Painel admin', icon: 'cpu', end: true }] : []),
      ],
    },
  ];

  return (
    <PanelShell
      scope="Área do cliente"
      home="/cliente"
      navLabel="Navegação da área do cliente"
      roleLabel="Área do cliente"
      groups={groups}
      userSubtitle={(user) => user?.company || 'Cliente'}
    />
  );
}
