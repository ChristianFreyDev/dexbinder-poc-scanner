/**
 * Acesso de leitura ao banco SQLite do catálogo completo instalado
 * (baixado/validado por catalogSync.js). Reescrito na Entrega 1: a versão
 * da Entrega 0 tinha um nome de arquivo DIFERENTE do que catalogSync.js
 * realmente baixa (`poc_catalog_index.db` vs `dexbinder_catalog.db`) e um
 * schema DIFERENTE do que scripts/sync-full-catalog.js realmente gera
 * (tinha `category`/`rarity`/`dex_ids`, que o catálogo real NÃO tem;
 * faltavam `set_official`/`set_total`/`set_printed_code`, que
 * src/scanner/rankCandidates.js PRECISA para desambiguar por total do set
 * e código de expansão impresso). Confirmado baixando o banco publicado de
 * verdade e inspecionando `sqlite_master` (ver reports/delivery-1.md).
 *
 * Schema real (fonte da verdade: scripts/sync-full-catalog.js):
 *   card_index(source_card_id, source_language, name, local_id, set_id,
 *              set_name, set_serie_id, set_official, set_total,
 *              set_printed_code, has_image, image_base_url)
 *   PRIMARY KEY (source_card_id, source_language)
 *
 * Não popula o banco (isso acontece fora do app, pelo workflow de
 * sincronização) — só abre o banco já instalado por catalogSync.js e
 * expõe consultas. `localId` é tratado sempre como texto (nunca convertido
 * para inteiro — especificação da Entrega 1, seção 4.4).
 */

const { mapRow, buildNumberCandidates } = require("./catalogRowMapping");

// require() de "./catalogSync" é LAZY (só dentro da função, não no topo do
// módulo): catalogSync.js importa expo-file-system/expo-sqlite, que não
// rodam em Node puro (ver catalogSyncDecision.js). Todas as outras funções
// deste arquivo recebem `db` já aberto por parâmetro — não precisam dessa
// importação — e por isso são testáveis de verdade em Node com um `db` de
// teste (ver scripts/run-catalog-index-query-tests.js, que injeta um
// adaptador sobre better-sqlite3 com a mesma interface async do expo-sqlite).
function openSyncedCatalogDb() {
  return require("./catalogSync").openSyncedCatalogDb();
}

/** Todas as linhas do catálogo instalado, sem nenhum filtro — uso interno do repositório. */
async function getAllRecords(db) {
  const rows = await db.getAllAsync(`SELECT * FROM card_index`);
  return rows.map(mapRow);
}

/** Pesquisa por nome (substring, case-insensitive via LIKE + lower em ambos os lados). */
async function searchByName(db, query, { lang = null, limit = 50 } = {}) {
  const like = `%${query.toLowerCase()}%`;
  const rows = lang
    ? await db.getAllAsync(
        `SELECT * FROM card_index WHERE lower(name) LIKE ? AND source_language = ? LIMIT ?`,
        [like, lang, limit]
      )
    : await db.getAllAsync(`SELECT * FROM card_index WHERE lower(name) LIKE ? LIMIT ?`, [like, limit]);
  return rows.map(mapRow);
}

/**
 * Pesquisa por número/localId, tratado sempre como texto. Tolera
 * zero-padding (ex.: "1", "01", "001" devem casar) comparando também a
 * forma sem zeros à esquerda — igual a numberMatches() em rankCandidates.js.
 */
async function searchByNumber(db, number, { setId = null, lang = null, limit = 50 } = {}) {
  const candidates = buildNumberCandidates(number);
  const placeholders = candidates.map(() => "?").join(", ");
  const conditions = [`local_id IN (${placeholders})`];
  const params = [...candidates];
  if (setId) {
    conditions.push(`set_id = ?`);
    params.push(setId);
  }
  if (lang) {
    conditions.push(`source_language = ?`);
    params.push(lang);
  }
  params.push(limit);
  const rows = await db.getAllAsync(
    `SELECT * FROM card_index WHERE ${conditions.join(" AND ")} LIMIT ?`,
    params
  );
  return rows.map(mapRow);
}

/** Pesquisa por nome ou id de expansão (set). */
async function searchBySet(db, query, { limit = 50 } = {}) {
  const like = `%${query.toLowerCase()}%`;
  const rows = await db.getAllAsync(
    `SELECT * FROM card_index WHERE lower(set_id) LIKE ? OR lower(set_name) LIKE ? LIMIT ?`,
    [like, like, limit]
  );
  return rows.map(mapRow);
}

/** Detalhe de uma impressão específica (chave real: source_card_id + source_language). */
async function getCardDetail(db, sourceCardId, sourceLanguage) {
  const row = await db.getFirstAsync(
    `SELECT * FROM card_index WHERE source_card_id = ? AND source_language = ?`,
    [sourceCardId, sourceLanguage]
  );
  return row ? mapRow(row) : null;
}

/** Expansões (sets) efetivamente presentes no catálogo instalado. */
async function listSets(db) {
  const rows = await db.getAllAsync(
    `SELECT DISTINCT set_id, set_name, set_serie_id FROM card_index ORDER BY set_name`
  );
  return rows.map((r) => ({ setId: r.set_id, setName: r.set_name, setSerieId: r.set_serie_id }));
}

/** Idiomas efetivamente presentes no catálogo instalado. */
async function listLanguages(db) {
  const rows = await db.getAllAsync(
    `SELECT DISTINCT source_language FROM card_index ORDER BY source_language`
  );
  return rows.map((r) => r.source_language);
}

/** Estatísticas rápidas do banco instalado (contagem total, não filtra física/digital). */
async function getStats(db) {
  const row = await db.getFirstAsync(`SELECT COUNT(*) AS c FROM card_index`);
  return { totalRecords: row ? row.c : 0 };
}

/**
 * Todas as impressões de UM set num idioma específico (exato, não LIKE) —
 * usada pela Entrega 2 (assistente de fichário de expansão) para checar se
 * um par set×idioma está elegível para gerar checklist automática completa
 * (especificação, seção 10: comparar a contagem obtida contra
 * set_official/set_total reais).
 */
async function getRecordsBySetAndLanguage(db, setId, lang) {
  const rows = await db.getAllAsync(`SELECT * FROM card_index WHERE set_id = ? AND source_language = ?`, [setId, lang]);
  return rows.map(mapRow);
}

/** Idiomas em que UM set específico tem pelo menos uma impressão sincronizada. */
async function listLanguagesForSet(db, setId) {
  const rows = await db.getAllAsync(`SELECT DISTINCT source_language FROM card_index WHERE set_id = ? ORDER BY source_language`, [
    setId,
  ]);
  return rows.map((r) => r.source_language);
}

module.exports = {
  openSyncedCatalogDb,
  getAllRecords,
  searchByName,
  searchByNumber,
  searchBySet,
  getCardDetail,
  listSets,
  listLanguages,
  getStats,
  getRecordsBySetAndLanguage,
  listLanguagesForSet,
  mapRow,
  buildNumberCandidates,
};
