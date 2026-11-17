/* =========================================================================
   Repositório de projetos (portfólio público + CRUD administrativo).
   Listas (features/technologies) são gravadas como JSON em TEXT.
   ========================================================================= */

const FIELDS = `id, title, slug, tagline, description, problem, solution,
                features, technologies, category, image, link, status,
                featured, is_mockup, is_public, created_at, updated_at`;

export function projectsRepository(db) {
  return {
    async listPublic() {
      return db.query(
        `SELECT ${FIELDS}
           FROM projects
          WHERE is_public = 1
          ORDER BY featured DESC, created_at DESC`
      );
    },

    async listAll({ limit, offset }) {
      return db.query(
        `SELECT ${FIELDS}
           FROM projects
          ORDER BY featured DESC, created_at DESC, id DESC
          LIMIT ? OFFSET ?`,
        [limit, offset]
      );
    },

    async findById(id) {
      return db.queryOne(`SELECT ${FIELDS} FROM projects WHERE id = ?`, [id]);
    },

    async findBySlug(slug) {
      return db.queryOne(`SELECT ${FIELDS} FROM projects WHERE slug = ?`, [slug]);
    },

    async create(data) {
      const now = Date.now();
      const { insertId } = await db.execute(
        `INSERT INTO projects
           (title, slug, tagline, description, problem, solution, features,
            technologies, category, image, link, status, featured, is_mockup,
            is_public, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.title,
          data.slug,
          data.tagline,
          data.description,
          data.problem,
          data.solution,
          data.features,
          data.technologies,
          data.category,
          data.image,
          data.link,
          data.status,
          data.featured,
          data.isMockup,
          data.isPublic,
          now,
          now,
        ]
      );
      return insertId;
    },

    async update(id, data) {
      const { affectedRows } = await db.execute(
        `UPDATE projects
            SET title = ?, slug = ?, tagline = ?, description = ?, problem = ?,
                solution = ?, features = ?, technologies = ?, category = ?,
                image = ?, link = ?, status = ?, featured = ?, is_mockup = ?,
                is_public = ?, updated_at = ?
          WHERE id = ?`,
        [
          data.title,
          data.slug,
          data.tagline,
          data.description,
          data.problem,
          data.solution,
          data.features,
          data.technologies,
          data.category,
          data.image,
          data.link,
          data.status,
          data.featured,
          data.isMockup,
          data.isPublic,
          Date.now(),
          id,
        ]
      );
      return affectedRows > 0;
    },

    async delete(id) {
      const { affectedRows } = await db.execute('DELETE FROM projects WHERE id = ?', [
        id,
      ]);
      return affectedRows > 0;
    },

    /** Quantos clientes estão vinculados a cada projeto: Map(id → total). */
    async clientCounts(ids) {
      const map = new Map();
      if (!ids.length) return map;
      const rows = await db.query(
        `SELECT project_id, COUNT(*) AS total
           FROM client_projects
          WHERE project_id IN (${ids.map(() => '?').join(', ')})
          GROUP BY project_id`,
        ids
      );
      for (const row of rows) map.set(Number(row.project_id), Number(row.total));
      return map;
    },

    /** Apaga só se NÃO houver vínculo (checagem e DELETE num único comando, sem corrida). */
    async deleteIfUnlinked(id) {
      const { affectedRows } = await db.execute(
        `DELETE FROM projects
          WHERE id = ?
            AND NOT EXISTS (SELECT 1 FROM client_projects WHERE project_id = ?)`,
        [id, id]
      );
      return affectedRows > 0;
    },

    /** Projetos vinculados a um cliente (o que ele vê no painel). */
    async listForUser(userId) {
      return db.query(
        `SELECT p.id, p.title, p.slug, p.tagline, p.status, p.image, p.category
           FROM client_projects cp
           JOIN projects p ON p.id = cp.project_id
          WHERE cp.user_id = ?
          ORDER BY p.created_at DESC`,
        [userId]
      );
    },

    async linkToUser(userId, projectId) {
      await db.execute(
        `INSERT INTO client_projects (user_id, project_id, created_at)
         VALUES (?, ?, ?)`,
        [userId, projectId, Date.now()]
      );
    },

    async unlinkFromUser(userId, projectId) {
      const { affectedRows } = await db.execute(
        'DELETE FROM client_projects WHERE user_id = ? AND project_id = ?',
        [userId, projectId]
      );
      return affectedRows > 0;
    },

    async isLinked(userId, projectId) {
      const row = await db.queryOne(
        'SELECT 1 AS found FROM client_projects WHERE user_id = ? AND project_id = ?',
        [userId, projectId]
      );
      return Boolean(row);
    },

    /**
     * Projetos ainda NÃO vinculados a este cliente — alimenta o seletor da
     * tela de vínculo já sem as opções que não fazem sentido.
     * Feito no banco (NOT EXISTS) em vez de filtrar em memória.
     */
    async listAvailableForUser(userId) {
      return db.query(
        `SELECT p.id, p.title, p.category, p.status
           FROM projects p
          WHERE NOT EXISTS (
                SELECT 1 FROM client_projects cp
                 WHERE cp.project_id = p.id AND cp.user_id = ?
          )
          ORDER BY p.title ASC`,
        [userId]
      );
    },

    async countAll() {
      const row = await db.queryOne('SELECT COUNT(*) AS total FROM projects');
      return Number(row?.total ?? 0);
    },

    /** `excludeId` permite editar um projeto mantendo o próprio slug. */
    async slugExists(slug, excludeId = null) {
      const row = excludeId
        ? await db.queryOne(
            'SELECT 1 AS found FROM projects WHERE slug = ? AND id <> ?',
            [slug, excludeId]
          )
        : await db.queryOne('SELECT 1 AS found FROM projects WHERE slug = ?', [slug]);
      return Boolean(row);
    },
  };
}
