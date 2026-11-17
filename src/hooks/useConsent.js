import { useSyncExternalStore } from 'react';
import { getConsentState, subscribeConsent } from '../utils/consent.js';

/** Estado do consentimento: { consent, panelOpen }. Atualiza quando a pessoa escolhe. */
export function useConsent() {
  return useSyncExternalStore(subscribeConsent, getConsentState, getConsentState);
}
