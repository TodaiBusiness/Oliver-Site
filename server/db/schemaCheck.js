/* =========================================================================
   Conferência do esquema: o banco tem tudo o que ESTE código usa?

   Motivo (incidente de 20/11/2026): a imagem nova do site subiu na VPS sem o
   `db-migrate.mjs` e o login do portal quebrou ("coluna status não existe",
   "tabela portal_sessions não existe"), enquanto o /api/health respondia 200.

   A lista do que é exigido sai do próprio `schema.postgres.sql` (CREATE TABLE e
   ALTER TABLE ... ADD COLUMN), então não há segunda lista para esquecer de
   atualizar. A conferência é um `SELECT "col", ... FROM "tabela" WHERE 1 = 0`
   por tabela: não lê linha nenhuma e funciona igual no PostgreSQL e no SQLite.
   ========================================================================= */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SCHEMA_PATH = resolve(import.meta.dirname, 'schema.postgres.sql');

/* Palavras que abrem uma linha de restrição, não de coluna, dentro do CREATE TABLE. */
const NAO_COLUNA = new Set(['CONSTRAINT', 'PRIMARY', 'UNIQUE', 'FOREIGN', 'CHECK', 'EXCLUDE']);

/** Tira comentários `--` (o schema não usa `/* *\/`) para o parser não tropeçar neles. */
function semComentarios(sql) {
  return sql.replace(/--[^\n]*/g, '');
}

/**
 * Lê o SQL do schema e devolve `Map<tabela, Set<coluna>>` com tudo o que ele cria.
 * Exportada para os testes.
 */
export function parseRequiredSchema(sql) {
  const texto = semComentarios(sql);
  const exigido = new Map();
  const add = (tabela, coluna) => {
    const t = tabela.toLowerCase();
    if (!exigido.has(t)) exigido.set(t, new Set());
    if (coluna) exigido.get(t).add(coluna.toLowerCase());
  };

  /* CREATE TABLE [IF NOT EXISTS] nome ( ... ); — o corpo vai até o ");" que fecha. */
  const create = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\s*\(([\s\S]*?)\n\s*\)\s*;/gi;
  for (const [, tabela, corpo] of texto.matchAll(create)) {
    add(tabela);
    /* Só abre coluna a linha que vem depois de uma vírgula (ou a primeira): a
       continuação de uma restrição ("    REFERENCES messages(id) ...") não conta. */
    let inicioDeItem = true;
    for (const linha of corpo.split('\n')) {
      if (!linha.trim()) continue;
      const m = /^\s*"?(\w+)"?\s+\S/.exec(linha);
      if (inicioDeItem && m && !NAO_COLUNA.has(m[1].toUpperCase())) add(tabela, m[1]);
      inicioDeItem = linha.trimEnd().endsWith(',');
    }
  }

  const alter = /ALTER\s+TABLE\s+"?(\w+)"?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gi;
  for (const [, tabela, coluna] of texto.matchAll(alter)) add(tabela, coluna);

  return exigido;
}

let exigidoCache = null;

/** O que o schema de produção exige (lido uma vez por processo). */
export function requiredSchema() {
  if (!exigidoCache) exigidoCache = parseRequiredSchema(readFileSync(SCHEMA_PATH, 'utf8'));
  return exigidoCache;
}

/**
 * Confere o banco. Devolve `{ ok: true }` ou `{ ok: false, missing: [...] }`, com
 * cada item "tabela" (tabela inteira faltando) ou "tabela.coluna". Erro de conexão
 * não é "esquema desatualizado": ele sobe (quem chama decide o que fazer).
 */
export async function checkSchema(db, exigido = requiredSchema()) {
  const missing = [];
  for (const [tabela, colunas] of exigido) {
    const lista = [...colunas].map((c) => `"${c}"`).join(', ') || '1';
    try {
      await db.query(`SELECT ${lista} FROM "${tabela}" WHERE 1 = 0`);
    } catch (error) {
      if (!ehErroDeEsquema(error)) throw error;
      /* Uma consulta só não diz QUAL coluna falta: pergunta uma por uma (só no caso ruim). */
      try {
        await db.query(`SELECT 1 FROM "${tabela}" WHERE 1 = 0`);
      } catch (erroTabela) {
        if (!ehErroDeEsquema(erroTabela)) throw erroTabela;
        missing.push(tabela);
        continue;
      }
      for (const coluna of colunas) {
        try {
          await db.query(`SELECT "${coluna}" FROM "${tabela}" WHERE 1 = 0`);
        } catch (erroColuna) {
          if (!ehErroDeEsquema(erroColuna)) throw erroColuna;
          missing.push(`${tabela}.${coluna}`);
        }
      }
    }
  }
  return missing.length ? { ok: false, missing } : { ok: true };
}

/* PostgreSQL: 42P01 = tabela não existe, 42703 = coluna não existe.
   SQLite (node:sqlite) não tem código próprio: vem pela mensagem. */
function ehErroDeEsquema(error) {
  if (error?.code === '42P01' || error?.code === '42703') return true;
  return /no such (table|column)/i.test(String(error?.message ?? ''));
}
