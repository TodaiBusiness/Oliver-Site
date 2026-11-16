/* =========================================================================
   Contexto da requisição em andamento (IP e user agent).

   Existe para a auditoria gravar de onde veio cada ação SEM cada serviço ter
   de repassar esses dados: `app.handle` abre o contexto, `audit.log` lê.
   ========================================================================= */

import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export const runWithRequest = (info, fn) => storage.run(info, fn);
export const currentRequest = () => storage.getStore() ?? {};
