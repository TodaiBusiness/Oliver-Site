import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

/* Inter (licença OFL) servida pelo próprio site: o CSP só permite fonte de 'self' (P-002). */
import '@fontsource-variable/inter';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/sections.css';
import './styles/overlays.css';
import './styles/panel.css';
import './styles/store.css';
import './styles/sistema.css';
import './styles/security.css';

import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
