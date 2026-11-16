import PanelShell from '../../components/panel/PanelShell.jsx';

const GROUPS = [
  {
    links: [
      { to: '/admin', label: 'Visão geral', icon: 'dashboard', end: true },
      { to: '/admin/solicitacoes', label: 'Solicitações', icon: 'bolt' },
      { to: '/admin/mensagens', label: 'Mensagens', icon: 'chat', badge: true },
      { to: '/admin/clientes', label: 'Clientes', icon: 'users' },
      { to: '/admin/projetos', label: 'Projetos', icon: 'layers' },
    ],
  },
  {
    label: 'Sistema',
    links: [
      { to: '/admin/auditoria', label: 'Auditoria', panelIcon: 'clock' },
      { to: '/admin/seguranca', label: 'Segurança', panelIcon: 'shield' },
    ],
  },
];

export default function AdminLayout() {
  return (
    <PanelShell
      scope="Administração"
      home="/admin"
      navLabel="Navegação administrativa"
      roleLabel="Administração"
      groups={GROUPS}
      userSubtitle={() => 'Equipe TODAI'}
    />
  );
}
