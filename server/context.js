/* =========================================================================
   Reúne os repositórios sobre uma conexão.
   Serviços recebem este objeto — nunca importam o banco direto. Isso é o que
   permite os testes rodarem contra um banco em memória sem gambiarra.
   ========================================================================= */

import { usersRepository } from './repositories/users.js';
import { sessionsRepository } from './repositories/sessions.js';
import { projectsRepository } from './repositories/projects.js';
import { requestsRepository } from './repositories/requests.js';
import { messagesRepository } from './repositories/messages.js';
import { attachmentsRepository } from './repositories/attachments.js';
import { auditRepository, loginAttemptsRepository } from './repositories/audit.js';
import { twoFactorRepository } from './repositories/twoFactor.js';
import { passwordResetsRepository } from './repositories/passwordResets.js';
import { createVault } from './security/vault.js';
import { config } from './config.js';

/**
 * `vault` é injetável para os testes escolherem a chave; por padrão sai de
 * SESSION_SECRET (ver security/vault.js).
 */
export function createContext(
  db,
  { vault = createVault({ secret: config.sessionSecret, isProduction: config.isProduction }) } = {}
) {
  return {
    db,
    vault,
    users: usersRepository(db),
    sessions: sessionsRepository(db),
    projects: projectsRepository(db),
    requests: requestsRepository(db),
    messages: messagesRepository(db),
    attachments: attachmentsRepository(db),
    audit: auditRepository(db),
    loginAttempts: loginAttemptsRepository(db),
    twoFactor: twoFactorRepository(db),
    passwordResets: passwordResetsRepository(db),
  };
}
