import ServicePage from '../components/ServicePage.jsx';
import { SERVICE_BY_SLUG } from '../data/services.js';

export default function ServicoLandingPages() {
  return <ServicePage service={SERVICE_BY_SLUG['landing-pages']} />;
}
